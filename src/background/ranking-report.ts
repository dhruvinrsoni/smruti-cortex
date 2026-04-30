// ranking-report.ts — Captures search state and formats ranking bug reports

import { Logger } from '../core/logger';
import { SettingsManager } from '../core/settings';
import { getLastSearchSnapshot, type SearchDebugSnapshot, type SearchDebugResultEntry } from './diagnostics';
import { maskTitle, maskUrl, maskQuery, maskToken, redactWord, type MaskingLevel } from '../shared/data-masker';
import { classifyMatch, MatchType } from './search/tokenizer';

const logger = Logger.forComponent('RankingReport');

const GITHUB_REPO_OWNER = 'dhruvinrsoni';
const GITHUB_REPO_NAME = 'smruti-cortex';
const MAX_RESULTS_IN_REPORT = 25;

export interface RankingReportOptions {
    maskingLevel: MaskingLevel;
    userNote?: string;
}

export interface RankingReport {
    title: string;
    body: string;
    version: string;
    timestamp: string;
    query: string;
    sortBy: string;
}

/**
 * Get the stored GitHub PAT (empty string when not configured).
 */
function getGitHubPAT(): string {
    const pat = SettingsManager.getSetting('developerGithubPat' as keyof ReturnType<typeof SettingsManager.getSettings>);
    return typeof pat === 'string' ? pat : '';
}

/**
 * Generate the full ranking bug report from the last search snapshot.
 */
export function generateRankingReport(options: RankingReportOptions): RankingReport | null {
    const snapshot = getLastSearchSnapshot();
    if (!snapshot) {
        logger.warn('generateRankingReport', 'No search snapshot available');
        return null;
    }

    const manifest = chrome.runtime.getManifest();
    const version = manifest.version;
    const timestamp = new Date(snapshot.timestamp).toISOString();

    const maskedQueryForTitle = maskQuery(snapshot.query, snapshot.tokens, options.maskingLevel);
    // Title shape: [Ranking] "<query>" — <N> results, sort=<mode> (v<version>)
    //
    // Why include sort here? D4's dedupe workflow keys on (query, sort,
    // major.minor) — without sort in the title two reports for the same
    // query but different sort modes (most-recent vs best-match) would
    // be flagged as duplicates even though they exercise different code
    // paths. Embedding sort here keeps the dedupe key visible in the
    // GitHub UI and avoids parsing the body to recover it.
    const title = `[Ranking] "${maskedQueryForTitle}" — ${snapshot.resultCount} results, sort=${snapshot.sortBy} (v${version})`;
    const body = formatReportBody(snapshot, version, timestamp, options);

    // report.query and report.sortBy are used by buildGitHubIssueUrl()
    // to pre-fill the Issue Form fields. At level=full the query must
    // not leak the raw user input — we already masked it for the title.
    return {
        title,
        body,
        version,
        timestamp,
        query: maskedQueryForTitle,
        sortBy: snapshot.sortBy,
    };
}

/**
 * Format the GitHub-flavored Markdown body.
 *
 * Masking gradient (see data-masker.ts for the contract table):
 *   - none:    everything raw — intended for local debugging only
 *   - partial: per-row title/domain/meta redacted; header Query + Tokens kept
 *              raw because they are the repro hook; AI keywords redacted per-word
 *   - full:    Query hashed, Tokens reduced to first-char+len, AI keywords
 *              collapsed to a count, Token Hits column collapsed to "-";
 *              numeric columns and settings snapshot remain visible to keep
 *              the report useful for algorithmic debugging
 */
function formatReportBody(
    snapshot: SearchDebugSnapshot,
    version: string,
    timestamp: string,
    options: RankingReportOptions,
): string {
    const { maskingLevel, userNote } = options;
    const lines: string[] = [];

    lines.push('## Ranking Bug Report (Auto-generated)');
    lines.push('');

    // Partial-match banner — surfaces the single biggest ranking failure mode
    // (no indexed item covers every query token) as a top-of-report callout.
    // The banner respects maskingLevel implicitly: we only leak counts, not
    // token literals.
    const tokensInQuery = snapshot.tokens.length;
    const topResults = snapshot.results.slice(0, MAX_RESULTS_IN_REPORT);
    const bestMatchCount = topResults.length > 0
        ? Math.max(...topResults.map(r => r.originalMatchCount))
        : 0;
    if (tokensInQuery > 0 && topResults.length > 0 && bestMatchCount < tokensInQuery) {
        lines.push(
            `> ⚠️ **Partial matches only.** No indexed item contains all ${tokensInQuery} query tokens. ` +
            `Showing best partial matches (best: ${bestMatchCount}/${tokensInQuery}).`
        );
        lines.push('');
    }

    // Degeneracy hint — when every top-N row ties on every relevance
    // tier (matches / intent / coverage / split / quality), the final
    // order is decided entirely by the sortBy preference. This is the
    // single most common 'random results for short queries' failure
    // mode we see in the wild: a 1-character query like 's' matches
    // 100+ items, all of them score 1/1 + intent=0 + coverage=1.0 +
    // quality=1.0, and the user perceives the resulting recency-sorted
    // list as 'random'. Surfacing the cause keeps maintainer triage
    // cheap and gives the user actionable advice ('add more tokens').
    if (topResults.length >= 2 && hasDegenerateTopN(topResults)) {
        lines.push(
            `> 🧊 **Degenerate ranking detected.** All top-${topResults.length} rows tie on every relevance tier ` +
            '(matches, intent, coverage, split, quality). Final order is determined entirely by ' +
            `sortBy=\`${snapshot.sortBy}\`. Add more query tokens for tighter ranking.`
        );
        lines.push('');
    }

    // Search context
    lines.push('### Search Context');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|-------|-------|');
    lines.push(`| Version | ${version} |`);
    lines.push(`| Query | \`${maskQuery(snapshot.query, snapshot.tokens, maskingLevel)}\` |`);
    lines.push(`| Tokens | ${snapshot.tokens.map(t => `\`${maskToken(t, maskingLevel)}\``).join(', ')} |`);
    if (snapshot.aiExpandedKeywords.length > 0) {
        lines.push(`| AI Expanded Keywords | ${formatAiKeywords(snapshot.aiExpandedKeywords, maskingLevel)} |`);
    }
    lines.push(`| Sort Mode | ${snapshot.sortBy} |`);
    lines.push(`| Results Returned | ${snapshot.resultCount} |`);
    lines.push(`| Total Indexed Items | ${snapshot.totalIndexedItems} |`);
    lines.push(`| Search Duration | ${snapshot.duration.toFixed(1)}ms |`);
    lines.push(`| Timestamp | ${timestamp} |`);
    lines.push('');

    if (userNote) {
        lines.push('### User Note');
        lines.push('');
        lines.push(userNote);
        lines.push('');
    }

    // Settings snapshot
    lines.push('<details>');
    lines.push('<summary><strong>Settings Snapshot</strong></summary>');
    lines.push('');
    lines.push('| Setting | Value |');
    lines.push('|---------|-------|');
    lines.push(`| sortBy | ${snapshot.sortBy} |`);
    lines.push(`| showNonMatchingResults | ${snapshot.showNonMatchingResults} |`);
    lines.push(`| showDuplicateUrls | ${snapshot.showDuplicateUrls} |`);
    lines.push(`| ollamaEnabled | ${snapshot.ollamaEnabled} |`);
    lines.push(`| embeddingsEnabled | ${snapshot.embeddingsEnabled} |`);
    lines.push(`| maskingLevel | ${maskingLevel} |`);
    lines.push('');
    lines.push('</details>');
    lines.push('');

    // Results table with sort tier columns for algorithm analysis
    const resultsToShow = snapshot.results.slice(0, MAX_RESULTS_IN_REPORT);
    lines.push(`### Results (Top ${resultsToShow.length})`);
    lines.push('');
    lines.push('| # | Title | Domain | Matches | Intent | Coverage | Quality | Score | Source | Field Hits |');
    lines.push('|---|-------|--------|---------|--------|----------|---------|-------|--------|------------|');

    for (const r of resultsToShow) {
        const maskedTitle = maskTitle(r.title, snapshot.tokens, maskingLevel);
        const maskedDomain = maskUrl(r.hostname || '', snapshot.tokens, maskingLevel);
        // Field-hit map: for each query token, list which fields (t=title,
        // u=url, h=hostname) it hits. Uses classifyMatch so boundary-flex
        // matches surface here too — the ranking report must not lie about
        // where a match came from.
        //
        // At level=full we collapse to "-" to avoid duplicating the
        // information the Matches column already reports as a count.
        const fieldHits = maskingLevel === 'full'
            ? ''
            : snapshot.tokens
                .map(t => {
                    const hits: string[] = [];
                    if (classifyMatch(t, r.title) !== MatchType.NONE) { hits.push('t'); }
                    if (classifyMatch(t, r.url) !== MatchType.NONE) { hits.push('u'); }
                    if (classifyMatch(t, r.hostname || '') !== MatchType.NONE) { hits.push('h'); }
                    if (hits.length === 0) { return ''; }
                    const name = maskingLevel === 'none' ? t : maskToken(t, maskingLevel);
                    return `${name}[${hits.join(',')}]`;
                })
                .filter(Boolean)
                .join(' ');
        const source = r.aiMatch ? (r.keywordMatch ? 'hybrid' : 'AI') : 'keyword';
        lines.push(
            `| ${r.rank} | ${maskedTitle} | ${maskedDomain} | ${r.originalMatchCount}/${snapshot.tokens.length} | ${r.intentPriority} | ${r.titleUrlCoverage.toFixed(2)} | ${r.titleUrlQuality.toFixed(2)} | ${r.finalScore.toFixed(3)} | ${source} | ${fieldHits || '-'} |`
        );
    }
    lines.push('');

    // Scorer breakdown with weights for algorithm debugging
    lines.push('<details>');
    lines.push('<summary><strong>Scorer Breakdown (per-scorer weighted scores)</strong></summary>');
    lines.push('');
    const interestingItems = pickInterestingItems(snapshot.results);
    if (interestingItems.length > 0) {
        const scorerNames = interestingItems[0].scorerBreakdown.map(s => s.name);
        const header = ['#', ...scorerNames.map((name, i) => {
            const w = interestingItems[0].scorerBreakdown[i].weight;
            return `${name} (w=${w})`;
        }), 'Final'].join(' | ');
        const sep = ['---', ...scorerNames.map(() => '---'), '---'].join(' | ');
        lines.push(`| ${header} |`);
        lines.push(`| ${sep} |`);
        for (const r of interestingItems) {
            const scores = r.scorerBreakdown.map(s => {
                const weighted = s.score * s.weight;
                return `${s.score.toFixed(3)} (${weighted.toFixed(3)})`;
            });
            lines.push(`| ${r.rank} | ${scores.join(' | ')} | ${r.finalScore.toFixed(3)} |`);
        }
    } else {
        lines.push('_No results to analyze._');
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');

    // Sort tier explanation for anyone debugging
    lines.push('<details>');
    lines.push('<summary><strong>Sort Tier Legend</strong></summary>');
    lines.push('');
    lines.push('Results are sorted by these tiers (higher tier = stronger signal):');
    lines.push('');
    lines.push('1. **Matches** — count of query tokens found in the item (2/2 > 1/2)');
    lines.push('2. **Intent** — bonus for exact title/URL phrase matches');
    lines.push('3. **Coverage** — fraction of title+URL covered by query tokens');
    lines.push('4. **Split coverage** — bonus when tokens hit BOTH title and URL (cross-field signal)');
    lines.push('5. **Quality** — how well tokens match (exact > prefix > substring)');
    lines.push('6. **sortBy preference** — within-tier ordering (recency / visits / alphabetical)');
    lines.push('7. **Final Score** — weighted sum of all 9 scorers (only used when sortBy = best-match)');
    lines.push('');
    lines.push('</details>');
    lines.push('');

    lines.push('### Expected Behavior');
    lines.push('');
    lines.push('_Describe which rows look mis-ranked and where you expected them to land:_');
    lines.push('');

    lines.push('---');
    lines.push(`_Auto-generated by SmrutiCortex v${version} · Report button · ${timestamp}_`);

    return lines.join('\n');
}

/**
 * Returns true when every result in `topResults` shares an identical
 * tier signature — i.e. the engine could not separate them on any of
 * the relevance tiers and the visible ordering is being decided by
 * sortBy alone.
 *
 * The signature deliberately rounds the float-valued tiers (coverage,
 * split, quality) to 2 decimals because the report itself prints them
 * with 2-decimal precision; tying at the visible precision is what the
 * user actually sees and reports as 'random'.
 *
 * Pure helper — no logger, no chrome APIs — so it is trivially
 * unit-testable.
 */
function hasDegenerateTopN(topResults: readonly SearchDebugResultEntry[]): boolean {
    if (topResults.length < 2) { return false; }
    const sig = (r: SearchDebugResultEntry): string =>
        `${r.originalMatchCount}|${r.intentPriority}|${r.titleUrlCoverage.toFixed(2)}|${r.splitFieldCoverage.toFixed(2)}|${r.titleUrlQuality.toFixed(2)}`;
    const first = sig(topResults[0]);
    return topResults.every(r => sig(r) === first);
}

/**
 * Format the AI Expanded Keywords header cell according to the masking level.
 *
 *   none    → `foo`, `bar`, `baz`
 *   partial → each keyword individually redacted via redactWord()
 *   full    → collapses to a count, e.g. "3 keywords"
 */
function formatAiKeywords(keywords: string[], level: MaskingLevel): string {
    if (level === 'none') {
        return keywords.map(k => `\`${k}\``).join(', ');
    }
    if (level === 'partial') {
        return keywords.map(k => `\`${redactWord(k)}\``).join(', ');
    }
    return `${keywords.length} keywords`;
}

/**
 * Pick the most diagnostic items for the scorer breakdown table:
 * top 5 results by rank, plus up to 3 additional results that share the
 * global maximum originalMatchCount (if not already in the top 5).
 */
function pickInterestingItems(results: SearchDebugResultEntry[]): SearchDebugResultEntry[] {
    if (results.length === 0) { return []; }

    const selected = new Map<number, SearchDebugResultEntry>();

    // Top 5
    for (let i = 0; i < Math.min(5, results.length); i++) {
        selected.set(results[i].rank, results[i]);
    }

    // Items with highest match count that aren't in top 5
    const maxCount = Math.max(...results.map(r => r.originalMatchCount));
    if (maxCount > 0) {
        const highMatchItems = results.filter(r => r.originalMatchCount === maxCount && !selected.has(r.rank));
        for (const item of highMatchItems.slice(0, 3)) {
            selected.set(item.rank, item);
        }
    }

    return Array.from(selected.values()).sort((a, b) => a.rank - b.rank);
}

/**
 * Create a GitHub issue via the GitHub API using a PAT.
 * Returns the issue URL on success.
 */
export async function createGitHubIssue(report: RankingReport): Promise<string> {
    const pat = getGitHubPAT();
    if (!pat) {
        throw new Error('No GitHub PAT configured');
    }

    const response = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pat}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: report.title,
                body: report.body,
                // Three labels:
                //   - ranking-bug    → semantic type, used by the triage workflow
                //   - auto-report    → tells maintainers this came from the
                //                      extension button, not a hand-filed issue
                //   - sink: ranking-reports → silo so the maintainer's main
                //                             issue queue can filter these out
                //                             via -label:"sink: ranking-reports"
                labels: ['ranking-bug', 'auto-report', 'sink: ranking-reports'],
            }),
        }
    );

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        throw new Error(`GitHub API ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    logger.info('createGitHubIssue', `Issue created: ${data.html_url}`);
    return data.html_url as string;
}

/**
 * Map our internal sortBy values onto the dropdown labels declared in
 * .github/ISSUE_TEMPLATE/ranking-report.yml. Issue-Form dropdowns reject
 * pre-fill values that don't match an existing option exactly, so we
 * normalise here once.
 */
function sortByToTemplateLabel(sortBy: string): string {
    switch (sortBy) {
        case 'best-match': return 'Best Match';
        case 'most-recent': return 'Most Recent';
        case 'most-visited': return 'Most Visited';
        case 'alphabetical': return 'Alphabetical';
        default: return 'Best Match';
    }
}

/**
 * Build a pre-filled GitHub issue URL (fallback when no PAT).
 *
 * Strategy: drive the dedicated `ranking-report.yml` Issue Form rather
 * than dumping a stub body into a blank issue. The form gives us:
 *   - Required `Query`, `Sort Mode`, `Ranking Problem` fields.
 *   - A dedicated `Debug Data` textarea (id=debug-data, render: markdown)
 *     so the user pastes the clipboard payload into a labelled box
 *     instead of an unstructured blob.
 *   - Default labels (ranking-bug, needs-triage) baked into the template
 *     — we still send labels= explicitly so legacy URL-fallbacks
 *     without a template id keep tagging issues consistently.
 *
 * URL params we set:
 *   - title              → our auto-generated `[Ranking] "..." ...` title
 *   - template           → ranking-report.yml (selects the form)
 *   - labels             → comma-joined label set (defensive duplicate)
 *   - query              → the masked query (form input id=query)
 *   - sort-mode          → mapped dropdown label
 *   - extension-version  → e.g. "9.2.0"
 *
 * We deliberately do NOT pass body= alongside template= — GitHub
 * silently drops body= when template= is present, and the previous
 * stub body confused users into thinking that was the only place to
 * paste their clipboard.
 */
export function buildGitHubIssueUrl(report: RankingReport): string {
    const baseUrl = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues/new`;

    const params = new URLSearchParams({
        template: 'ranking-report.yml',
        title: report.title,
        // labels= is a comma-joined list; URLSearchParams handles the
        // percent-encoding of the space inside 'sink: ranking-reports'
        // automatically.
        labels: 'ranking-bug,auto-report,sink: ranking-reports',
        query: report.query,
        'sort-mode': sortByToTemplateLabel(report.sortBy),
        'extension-version': report.version,
    });

    return `${baseUrl}?${params.toString()}`;
}
