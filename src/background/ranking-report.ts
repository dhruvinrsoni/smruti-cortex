// ranking-report.ts — Captures search state and formats ranking bug reports

import { Logger } from '../core/logger';
import { SettingsManager } from '../core/settings';
import { getLastSearchSnapshot, type SearchDebugSnapshot, type SearchDebugResultEntry } from './diagnostics';
import { maskTitle, maskUrl, type MaskingLevel } from '../shared/data-masker';

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
}

/**
 * Get the stored GitHub PAT (empty string when not configured).
 */
export function getGitHubPAT(): string {
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

    const title = `[Ranking] "${snapshot.query}" — ${snapshot.resultCount} results (v${version})`;
    const body = formatReportBody(snapshot, version, timestamp, options);

    return { title, body, version, timestamp, query: snapshot.query };
}

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

    // Search context
    lines.push('### Search Context');
    lines.push('');
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Version | ${version} |`);
    lines.push(`| Query | \`${snapshot.query}\` |`);
    lines.push(`| Tokens | ${snapshot.tokens.map(t => `\`${t}\``).join(', ')} |`);
    if (snapshot.aiExpandedKeywords.length > 0) {
        lines.push(`| AI Expanded Keywords | ${snapshot.aiExpandedKeywords.map(t => `\`${t}\``).join(', ')} |`);
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
    lines.push(`| Setting | Value |`);
    lines.push(`|---------|-------|`);
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
    lines.push('| # | Title | Domain | Matches | Intent | Coverage | Quality | Score | Source | Token Hits |');
    lines.push('|---|-------|--------|---------|--------|----------|---------|-------|--------|------------|');

    for (const r of resultsToShow) {
        const maskedTitle = maskTitle(r.title, snapshot.tokens, maskingLevel);
        const maskedDomain = maskUrl(r.hostname || '', snapshot.tokens, maskingLevel);
        const tokenHits = snapshot.tokens.filter(t =>
            (r.title + ' ' + r.url).toLowerCase().includes(t)
        ).join(', ');
        const source = r.aiMatch ? (r.keywordMatch ? 'hybrid' : 'AI') : 'keyword';
        lines.push(
            `| ${r.rank} | ${maskedTitle} | ${maskedDomain} | ${r.originalMatchCount}/${snapshot.tokens.length} | ${r.intentPriority} | ${r.titleUrlCoverage.toFixed(2)} | ${r.titleUrlQuality.toFixed(2)} | ${r.finalScore.toFixed(3)} | ${source} | ${tokenHits || '-'} |`
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
    lines.push('4. **Quality** — how well tokens match (exact > prefix > substring)');
    lines.push('5. **sortBy preference** — user\'s chosen sort (recency/visits/alpha) within same tier');
    lines.push('6. **Final Score** — weighted sum of all 9 scorers as tiebreaker');
    lines.push('');
    lines.push('</details>');
    lines.push('');

    lines.push('### Expected Behavior');
    lines.push('');
    lines.push('_Describe what you expected to see ranked differently:_');
    lines.push('');

    lines.push('---');
    lines.push(`_Auto-generated by SmrutiCortex v${version} · Report button · ${timestamp}_`);

    return lines.join('\n');
}

/**
 * Pick the most diagnostic items: top 5 + items near the boundary where
 * match count drops, plus the bottom 3 that have highest match count.
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
                labels: ['ranking-bug', 'auto-report'],
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
 * Build a pre-filled GitHub issue URL (fallback when no PAT).
 * The full report body is too large for URL params, so the URL only contains
 * a stub. The full report is copied to clipboard by the UI caller.
 */
export function buildGitHubIssueUrl(report: RankingReport): string {
    const baseUrl = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues/new`;

    const stubBody = [
        '## Ranking Bug Report (Auto-generated)',
        '',
        `**Query:** \`${report.query}\``,
        `**Version:** ${report.version}`,
        `**Timestamp:** ${report.timestamp}`,
        '',
        '### Debug Data',
        '',
        '> **Paste the full report from your clipboard below this line.**',
        '> It was auto-copied when you clicked the Report button.',
        '',
        '',
        '',
        '',
        '',
        '### What\'s Wrong with the Ranking?',
        '',
        '_Describe which results are misranked and where you expected them._',
    ].join('\n');

    const params = new URLSearchParams({
        title: report.title,
        body: stubBody,
        labels: 'ranking-bug,auto-report',
    });

    return `${baseUrl}?${params.toString()}`;
}
