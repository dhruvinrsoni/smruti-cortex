#!/usr/bin/env node

/**
 * SmrutiCortex Chrome Web Store verification + scaffolding.
 *
 * Why this exists
 * ---------------
 * We've historically relied on the maintenance SKILL checklist to remind us to
 * create a docs/store-submissions/vX.Y.Z-chrome-web-store.md file for every
 * release. That's human-enforced. It was missed for v9.1.0. This script makes
 * the invariant machine-enforced.
 *
 * What it does
 * ------------
 * Given a version (or latest git tag), verify:
 *   1. Local submission doc exists at docs/store-submissions/vX.Y.Z-chrome-web-store.md
 *   2. Submission doc has a real "Submitted" date (not "TBD")
 *   3. Release zip exists at release/zips/smruti-cortex-vX.Y.Z.zip
 *   4. CHANGELOG.md has a [X.Y.Z] entry
 *   5. Public Chrome Web Store listing is on the expected version
 *   6. Public listing "What's New" text does not reference a stale version
 *
 * Usage
 * -----
 *   node scripts/store-check.mjs                    # check latest git tag
 *   node scripts/store-check.mjs 9.1.0              # check specific version
 *   node scripts/store-check.mjs 9.2.0 --init       # scaffold new submission doc
 *   node scripts/store-check.mjs 9.2.0 --init --dry-run   # preview without writing
 *   node scripts/store-check.mjs 9.2.0 --init --force     # overwrite existing doc
 *   node scripts/store-check.mjs --json             # machine-readable output
 *   node scripts/store-check.mjs --strict           # promote WARNs to FAILs
 *   node scripts/store-check.mjs --no-remote        # skip CWS fetch (offline)
 *
 * --json output schema (schemaVersion: 1)
 * ---------------------------------------
 * The --json mode emits a single JSON object on stdout (pretty-printed) with
 * the following stable contract. Consumers should pin to schemaVersion and
 * IGNORE unknown keys (additive changes keep schemaVersion=1).
 *
 *   {
 *     "schemaVersion": 1,
 *     "version":       string,            // e.g. "9.2.0"
 *     "vTag":          string,            // e.g. "v9.2.0"
 *     "storeUrl":      string,            // CWS detail page URL
 *     "submittedDate": string | null,     // raw "> Submitted: ..." text or null
 *     "strict":        boolean,           // was --strict passed?
 *     "noRemote":      boolean,           // was --no-remote passed?
 *     "public":        object | null,     // CWS fetch result (null if --no-remote)
 *     "results": [
 *       {
 *         "name":            string,                 // human-readable check label
 *         "status":          "pass"|"warn"|"fail"|"info",
 *         "detail":          string,                 // short message
 *         "originalStatus"?: "warn"                  // present iff promoted by --strict
 *       },
 *       ...
 *     ],
 *     "summary": {
 *       "failed":   number,
 *       "warned":   number,
 *       "passed":   number,
 *       "info":     number,
 *       "total":    number,
 *       "exitCode": 0 | 1
 *     }
 *   }
 *
 * Exit codes
 * ----------
 *   0  all checks passed
 *   1  at least one check failed (usable as a CI gate)
 *   2  usage error
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { execSync } from 'child_process';

const ROOT = resolve(import.meta.dirname, '..');
const SUBMISSIONS_DIR = resolve(ROOT, 'docs', 'store-submissions');
const RELEASE_DIR = resolve(ROOT, 'release');
const CHANGELOG_PATH = resolve(ROOT, 'CHANGELOG.md');
const MANIFEST_PATH = resolve(ROOT, 'manifest.json');

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
const STORE_URL = pkg.chromeStoreUrl;

// ---------- argv ----------

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const INIT_MODE = args.includes('--init');
const NO_REMOTE = args.includes('--no-remote');
// --strict promotes every WARN outcome to FAIL. Used by `npm run ship`'s
// release gate (verify.mjs forwards its own --strict flag down here) so
// that diagnostic [warn]s like "release zip exists" or "CWS unreachable"
// hard-block a real release instead of silently sliding through.
const STRICT_MODE = args.includes('--strict');
// --init flags: --dry-run prints the scaffolded doc to stdout without
// writing; --force overwrites an existing target doc with a confirmation.
const INIT_DRY_RUN = args.includes('--dry-run');
const INIT_FORCE = args.includes('--force');
// --verbose restores the long-form `store check` banner (header + version
// preamble) that used to print unconditionally. Default is now terse: just
// the per-check rows + a one-line outcome.
const VERBOSE = args.includes('--verbose') || args.includes('-v');
const explicitVersion = args.find(a => /^\d+\.\d+\.\d+$/.test(a));

/**
 * Runs a shell command with stdin ignored and BOTH stdout/stderr captured
 * (was: stderr piped to 'ignore', which made debug-time failures opaque
 * — operators saw only `[fatal]` with no underlying cause from git).
 *
 * On non-zero exit, throws an Error whose `.message` carries the stderr
 * tail (last ~20 lines) so callers and SUMMARY footers stay readable.
 */
function runSilent(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    const stderr = (err.stderr || '').toString();
    const stdout = (err.stdout || '').toString();
    const tail = (stderr || stdout)
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-20)
      .join('\n');
    const wrapped = new Error(tail
      ? `Command failed: ${cmd}\n${tail}`
      : `Command failed: ${cmd} (exit ${err.status ?? '?'})`,
    );
    wrapped.cause = err;
    wrapped.stdoutTail = stdout;
    wrapped.stderrTail = tail;
    throw wrapped;
  }
}

function latestGitTag() {
  try {
    const out = runSilent('git tag --sort=-v:refname');
    const tag = out.split(/\r?\n/).find(t => /^v\d+\.\d+\.\d+$/.test(t));
    return tag ? tag.replace(/^v/, '') : null;
  } catch {
    return null;
  }
}

const invokedAsMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

// Defer fatal exits / version resolution until we know we're the CLI entry
// (so unit tests can import the pure helpers without triggering process.exit).
let version = null;
let vTag = null;
if (invokedAsMain) {
  if (!STORE_URL) {
    console.error('[fatal] package.json is missing "chromeStoreUrl".');
    process.exit(2);
  }
  version = explicitVersion || latestGitTag() || pkg.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`[fatal] Could not determine version to check. Got: ${version}`);
    process.exit(2);
  }
  vTag = `v${version}`;
}

// ---------- helpers ----------

function fmt(status, label, detail) {
  const icon = status === 'pass' ? '[ok]' : status === 'warn' ? '[warn]' : status === 'fail' ? '[fail]' : '[info]';
  const pad = label.padEnd(36);
  return `${icon} ${pad} ${detail || ''}`.trimEnd();
}

function listPrevVersion(current) {
  // Pick the next-older released tag from git. If `current` isn't tagged yet
  // (i.e. we're scaffolding for a future release), fall back to the newest
  // existing tag.
  try {
    const tags = runSilent('git tag --sort=-v:refname').split(/\r?\n/).filter(t => /^v\d+\.\d+\.\d+$/.test(t));
    const idx = tags.indexOf(`v${current}`);
    if (idx >= 0 && idx + 1 < tags.length) return tags[idx + 1].replace(/^v/, '');
    if (idx < 0 && tags.length > 0) return tags[0].replace(/^v/, '');
  } catch { /* ignore */ }
  return null;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * 10-second cap on the entire CWS round-trip (connect + read body).
 * A slow / hung CWS used to wedge `npm run ship` Step 2 indefinitely;
 * now the public-store gate WARNs (or FAILs in --strict) instead of blocking.
 */
const FETCH_TIMEOUT_MS = 10_000;

async function fetchStore() {
  if (NO_REMOTE) return null;
  try {
    const res = await fetch(STORE_URL, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 smruti-cortex-store-check',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    const text = stripHtml(html);

    // These patterns rely on the Chrome Web Store rendering "Label\nValue"
    // once the HTML is collapsed. If Google changes the layout, each extractor
    // fails gracefully (returns null) rather than crashing the script.
    const versionMatch = text.match(/^Version\s*\n\s*(\d+\.\d+\.\d+)/m);
    const updatedMatch = text.match(/^Updated\s*\n\s*([A-Z][a-z]+ \d{1,2},? \d{4})/m);
    const sizeMatch = text.match(/^Size\s*\n\s*([0-9.]+\s*[KMG]?iB)/m);
    const usersMatch = text.match(/([\d,]+)\s*users/);
    // "New in vX.Y.Z" is our own convention inside Description / What's New.
    const whatsNewVersionMatch = text.match(/New in v(\d+\.\d+\.\d+)/);

    return {
      version: versionMatch ? versionMatch[1] : null,
      updated: updatedMatch ? updatedMatch[1] : null,
      size: sizeMatch ? sizeMatch[1] : null,
      users: usersMatch ? usersMatch[1] : null,
      whatsNewVersion: whatsNewVersionMatch ? whatsNewVersionMatch[1] : null,
      rawTextLength: text.length,
    };
  } catch (err) {
    // AbortSignal.timeout fires a TimeoutError DOMException; surface a clear,
    // operator-friendly message instead of the cryptic "The operation was aborted".
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return { error: `CWS fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s` };
    }
    return { error: err.message };
  }
}

// ---------- init mode ----------

// Compare two semver strings. Returns negative if a < b, zero if equal,
// positive if a > b. Only handles strict X.Y.Z (no prerelease tags) — the
// extension uses pure numeric semver.
function semverCompare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function initSubmissionDoc(newVersion, { dryRun = false, force = false } = {}) {
  // Validate the version string before anything else — a malformed version
  // would silently break listPrevVersion and cascading checks below.
  if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.error(`[fatal] Invalid version "${newVersion}" — expected X.Y.Z (numeric only).`);
    process.exit(2);
  }

  const prev = listPrevVersion(newVersion);
  if (!prev) {
    console.error(`[fatal] Cannot scaffold — no previous released tag found before v${newVersion}.`);
    process.exit(2);
  }

  // Refuse downgrades BEFORE checking for an existing target doc. If both
  // gates fired, the operator would see "doc already exists" and assume
  // the cleanup was just that path, when the real problem is they typed
  // a stale version number. Surface the semantic error first.
  //
  // listPrevVersion picks the largest released version strictly less than
  // newVersion, so if `newVersion <= prev` the operator either fat-fingered
  // the version or there's a stale tag we should not step over.
  if (semverCompare(newVersion, prev) <= 0) {
    console.error(`[fatal] Refusing to scaffold v${newVersion} — not greater than previous released v${prev}.`);
    console.error(`        Did you mean to bump the next version? Or is there a stale tag at v${newVersion}?`);
    process.exit(2);
  }

  const prevDoc = resolve(SUBMISSIONS_DIR, `v${prev}-chrome-web-store.md`);
  const newDoc = resolve(SUBMISSIONS_DIR, `v${newVersion}-chrome-web-store.md`);
  // --dry-run never writes, so don't bail on existing target — operators use
  // --dry-run specifically to diff against the existing doc. --force allows
  // overwrite with a noisy confirmation log line. Otherwise, refuse.
  if (existsSync(newDoc) && !dryRun && !force) {
    console.error(`[fatal] ${newDoc} already exists. Refusing to overwrite.`);
    console.error(`        Pass --force to overwrite, or --dry-run to preview without writing.`);
    process.exit(2);
  }
  if (!existsSync(prevDoc)) {
    console.error(`[fatal] Previous submission doc not found: ${prevDoc}`);
    process.exit(2);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Prefer the git-tag date for "Released (tagged)" when the new tag exists
  // (typical when scaffolding post-tag, e.g. for a re-submission). Fall back
  // to today's ISO date when no tag yet (typical pre-release scaffold during
  // `npm run ship` Step 4). `git log -1 --format=%ai` returns ISO 8601 with
  // a timezone; we slice to YYYY-MM-DD to match the doc convention.
  let releasedDate = today;
  try {
    const tagRef = `v${newVersion}`;
    if (runSilent(`git tag -l ${tagRef}`)) {
      releasedDate = runSilent(`git log -1 --format=%ai ${tagRef}`).slice(0, 10);
    }
  } catch { /* fall back to today */ }

  const prevContent = readFileSync(prevDoc, 'utf-8');

  // Generate a rough Changes-from-Previous section from git log.
  // If the target tag doesn't exist yet (scaffolding pre-release), walk from
  // the previous tag to HEAD instead.
  const targetRef = runSilent(`git tag -l v${newVersion}`) ? `v${newVersion}` : 'HEAD';
  let gitLog = '';
  try {
    gitLog = runSilent(`git log v${prev}..${targetRef} --pretty=format:"- %s"`);
  } catch {
    gitLog = '(unable to read git log; fill this section manually)';
  }
  if (!gitLog.trim()) {
    gitLog = `(no commits between v${prev} and ${targetRef})`;
  }

  // Each entry is [pattern, replacement, label]. We apply them in order and
  // verify each one actually matched something in the previous doc — if a
  // pattern fails to match (e.g. previous operator hand-edited the header
  // and broke the template shape), we want a loud error now, not a silently
  // mis-scaffolded doc that downstream `store check` flags as a parity bug.
  const replacements = [
    [/# Chrome Web Store Submission — SmrutiCortex v[\d.]+/, `# Chrome Web Store Submission — SmrutiCortex v${newVersion}`, 'title'],
    [/> Version: [\d.]+/, `> Version: ${newVersion}`, 'Version'],
    [/> Released \(tagged\): [\d-]+/, `> Released (tagged): ${releasedDate}`, 'Released (tagged)'],
    [/> Drafted: [\d-]+/, `> Drafted: ${today}`, 'Drafted'],
    [/> Submitted: [^\n]+/, `> Submitted: _TBD — fill in after upload_`, 'Submitted'],
    [/> Package: `release\/(zips\/)?smruti-cortex-v[\d.]+\.zip`/, `> Package: \`release/zips/smruti-cortex-v${newVersion}.zip\``, 'Package path'],
    [/> Previous version: v[\d.]+/, `> Previous version: v${prev}`, 'Previous version'],
  ];

  let scaffolded = prevContent;
  const unmatched = [];
  for (const [pattern, replacement, label] of replacements) {
    if (!pattern.test(scaffolded)) {
      unmatched.push(label);
      continue;
    }
    scaffolded = scaffolded.replace(pattern, replacement);
  }

  if (unmatched.length > 0) {
    console.error(`[fatal] Template replacement(s) failed to match in v${prev} doc:`);
    for (const label of unmatched) console.error(`        - ${label}`);
    console.error(`        The previous doc may have drifted from template shape. Restore the missing header lines or scaffold from a different base.`);
    process.exit(2);
  }

  // Compute permission delta vs the previous tagged version so the scaffolded
  // doc carries an explicit fill-in-the-blank banner. Without this, an operator
  // can blindly run --init, paste the result into CWS, and ship a manifest with
  // an undocumented permission (the v9.2.0 `idle` regression).
  const permBannerLines = [];
  try {
    const currentManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const prevManifestRaw = runSilent(`git show v${prev}:manifest.json`);
    const prevManifest = JSON.parse(prevManifestRaw);
    const delta = computePermissionDelta(prevManifest, currentManifest);
    const totalChanges =
      delta.requiredAdded.length + delta.requiredRemoved.length +
      delta.optionalAdded.length + delta.optionalRemoved.length;

    if (totalChanges === 0) {
      permBannerLines.push('');
      permBannerLines.push(`  PERMISSION DELTA vs v${prev}: NONE.`);
      permBannerLines.push(`  Section 4 entries should be byte-identical to v${prev}.`);
    } else {
      permBannerLines.push('');
      permBannerLines.push(`  PERMISSION DELTA vs v${prev} — ${totalChanges} change(s):`);
      if (delta.requiredAdded.length) {
        permBannerLines.push('    REQUIRED ADDED — append a #### block to Section 4 > Required Permissions:');
        delta.requiredAdded.forEach(p =>
          permBannerLines.push(`      + \`${p}\` *(new in v${newVersion})* — TODO: write justification.`),
        );
      }
      if (delta.requiredRemoved.length) {
        permBannerLines.push('    REQUIRED REMOVED — delete the matching #### block from Section 4 > Required Permissions:');
        delta.requiredRemoved.forEach(p =>
          permBannerLines.push(`      - \`${p}\` — TODO: delete justification block.`),
        );
      }
      if (delta.optionalAdded.length) {
        permBannerLines.push('    OPTIONAL ADDED — append a #### block to Section 4 > Optional Permissions:');
        delta.optionalAdded.forEach(p =>
          permBannerLines.push(`      + \`${p}\` *(new in v${newVersion})* — TODO: write justification.`),
        );
      }
      if (delta.optionalRemoved.length) {
        permBannerLines.push('    OPTIONAL REMOVED — delete the matching #### block from Section 4 > Optional Permissions:');
        delta.optionalRemoved.forEach(p =>
          permBannerLines.push(`      - \`${p}\` — TODO: delete justification block.`),
        );
      }
      permBannerLines.push('    Run `npm run store check` after editing — it will FAIL until parity is restored.');
    }
  } catch (err) {
    permBannerLines.push('');
    permBannerLines.push(`  PERMISSION DELTA: could not compute (${err.message}).`);
    permBannerLines.push(`  Manually diff manifest.json against v${prev} and update Section 4 accordingly.`);
  }

  // Swift, action-oriented preamble (T1). Trimmed from the previous
  // numbered-paragraph form to a 5-item checklist so an operator can
  // tick boxes instead of reading prose. The PERMISSION DELTA banner
  // (when non-empty) and raw git log still follow — those are the
  // editable bits the operator actually consults.
  const preamble = `<!-- TODO before submitting v${newVersion} (delete this block when done):
- [ ] Fill in "Submitted" date after upload.
- [ ] What's New: 3 bullets max, user-facing language.
- [ ] Section 4 reflects manifest.json (run \`npm run store check\`).
- [ ] Section 7 rewritten from the raw git log below into prose.
- [ ] Screenshots refreshed if the UI changed.
${permBannerLines.join('\n')}

  Raw git log v${prev}..v${newVersion}:
${gitLog.split('\n').map(l => '    ' + l).join('\n')}
-->

`;

  scaffolded = preamble + scaffolded;

  if (dryRun) {
    // Print directly to stdout so operators can pipe into a pager or
    // diff against the existing file. The preview banner goes to stderr
    // so stdout stays a clean copy of the proposed content.
    console.error(`[dry-run] Would write ${newDoc} (Base: v${prev} -> Target: v${newVersion}).`);
    console.error(`[dry-run] No files modified. Re-run without --dry-run to write.`);
    process.stdout.write(scaffolded);
    return;
  }

  // Capture the existing-doc size *before* the write so the --force log line
  // can show the operator the line-count delta — a quiet sanity signal that
  // the overwrite is the size they expect (and not e.g. a 200-line doc
  // accidentally replaced with a 20-line stub).
  const overwriting = existsSync(newDoc);
  let oldLineCount = 0;
  if (overwriting) {
    try { oldLineCount = readFileSync(newDoc, 'utf-8').split(/\r?\n/).length; } catch { /* best-effort */ }
  }
  const newLineCount = scaffolded.split(/\r?\n/).length;

  writeFileSync(newDoc, scaffolded, 'utf-8');

  if (overwriting) {
    // ANSI yellow so the OVERWROTE line is visually distinct in a long
    // CI log — operators glancing at a release pipeline should never
    // miss that a --force overwrite happened.
    const YELLOW = '\x1b[33m';
    const BOLD = '\x1b[1m';
    const RESET = '\x1b[0m';
    console.log(`${YELLOW}${BOLD}[OVERWROTE]${RESET} ${newDoc} (--force; ${oldLineCount} -> ${newLineCount} lines).`);
  } else {
    console.log(`[ok] Scaffolded ${newDoc} (${newLineCount} lines).`);
  }
  console.log(`[info] Base: v${prev} → Target: v${newVersion}`);
  console.log(`[info] Inserted a TODO preamble with the raw git log. Rewrite Section 7 before submitting.`);
}

// ---------- permission audit (pure helpers, exported for unit tests) ----------

/**
 * Extract the declared permission lists from a parsed manifest.json.
 *
 * Returns four string arrays in original declaration order:
 *   - required      : permissions[]
 *   - optional      : optional_permissions[]
 *   - hostRequired  : host_permissions[]
 *   - hostOptional  : optional_host_permissions[]
 *
 * Missing arrays are normalised to `[]` so callers never have to null-check.
 * The host arrays were added in S7; older callers that only care about
 * required/optional can ignore the extra fields.
 *
 * @param {object} manifestJson  The parsed contents of manifest.json.
 * @returns {{required: string[], optional: string[], hostRequired: string[], hostOptional: string[]}}
 */
export function parseManifestPermissions(manifestJson) {
  const required     = Array.isArray(manifestJson?.permissions)              ? [...manifestJson.permissions]              : [];
  const optional     = Array.isArray(manifestJson?.optional_permissions)     ? [...manifestJson.optional_permissions]     : [];
  const hostRequired = Array.isArray(manifestJson?.host_permissions)         ? [...manifestJson.host_permissions]         : [];
  const hostOptional = Array.isArray(manifestJson?.optional_host_permissions) ? [...manifestJson.optional_host_permissions] : [];
  return { required, optional, hostRequired, hostOptional };
}

/**
 * Extract the permission names that have a `#### \`<perm>\`` heading inside
 * the four documented Section-4 subsections:
 *   - "### Required Permissions"        -> required
 *   - "### Optional Permissions"        -> optional
 *   - "### Required Host Permissions"   -> hostRequired (S7)
 *   - "### Optional Host Permissions"   -> hostOptional (S7)
 *
 * Recognises:
 *   #### `idle`
 *   #### `idle` *(new in v9.2.0)*
 *   #### `<all_urls>`
 *
 * Stops scanning a subsection at the next `### `, `## `, or `---` boundary.
 *
 * @param {string} docText  Full markdown text of vX.Y.Z-chrome-web-store.md.
 * @returns {{required: string[], optional: string[], hostRequired: string[], hostOptional: string[]}}
 */
export function parseDocPermissions(docText) {
  const required = [];
  const optional = [];
  const hostRequired = [];
  const hostOptional = [];
  // Order matters: longer / more-specific headings first, so "Optional Host
  // Permissions" is checked before "Optional Permissions" (which would
  // otherwise match "Optional" via the prefix).
  let mode = null;
  for (const line of docText.split(/\r?\n/)) {
    if (/^###\s+Required Host Permissions\b/.test(line))    { mode = 'hostRequired'; continue; }
    if (/^###\s+Optional Host Permissions\b/.test(line))    { mode = 'hostOptional'; continue; }
    if (/^###\s+Required Permissions\b/.test(line))         { mode = 'required';     continue; }
    if (/^###\s+Optional Permissions\b/.test(line))         { mode = 'optional';     continue; }
    if (/^##\s+/.test(line) || /^###\s+/.test(line) || /^---\s*$/.test(line)) { mode = null; continue; }
    if (!mode) continue;
    const m = line.match(/^####\s+`([^`]+)`/);
    if (!m) continue;
    if (mode === 'required')          required.push(m[1]);
    else if (mode === 'optional')     optional.push(m[1]);
    else if (mode === 'hostRequired') hostRequired.push(m[1]);
    else if (mode === 'hostOptional') hostOptional.push(m[1]);
  }
  return { required, optional, hostRequired, hostOptional };
}

/**
 * Compare manifest permissions against documented justifications and return
 * a list of structured issues. An empty array means the doc and manifest are
 * in sync.
 *
 * Issue shape: { kind, perm } where `kind` is one of:
 *   - 'missing-required-justification' → declared in manifest, no #### in doc
 *   - 'missing-optional-justification'
 *   - 'stale-required-justification'   → has #### in doc, not in manifest
 *   - 'stale-optional-justification'
 *
 * Order: missing-first (most actionable), then stale.
 *
 * @param {{required: string[], optional: string[]}} manifestPerms
 * @param {{required: string[], optional: string[]}} docPerms
 * @returns {Array<{kind: string, perm: string}>}
 */
/**
 * Compute the permission delta between two parsed manifest.json objects.
 *
 * Used by the `--init` scaffolder to inject a fill-in-the-blank "PERMISSION
 * DELTA" banner into the preamble of a freshly scaffolded submission doc, so
 * the operator can never miss adding (or removing) a Section 4 entry — the
 * exact slip behind the v9.2.0 `idle` regression.
 *
 * @param {object} prevManifestJson    Parsed prior-version manifest.json.
 * @param {object} currentManifestJson Parsed current manifest.json.
 * @returns {{requiredAdded: string[], requiredRemoved: string[],
 *            optionalAdded: string[], optionalRemoved: string[]}}
 */
export function computePermissionDelta(prevManifestJson, currentManifestJson) {
  const prev = parseManifestPermissions(prevManifestJson || {});
  const cur = parseManifestPermissions(currentManifestJson || {});
  return {
    requiredAdded:       cur.required.filter(p => !prev.required.includes(p)),
    requiredRemoved:     prev.required.filter(p => !cur.required.includes(p)),
    optionalAdded:       cur.optional.filter(p => !prev.optional.includes(p)),
    optionalRemoved:     prev.optional.filter(p => !cur.optional.includes(p)),
    // Host-permission deltas (S7) — same shape semantics for symmetry. Older
    // callers iterating only the four core arrays will silently ignore these.
    hostRequiredAdded:   cur.hostRequired.filter(p => !prev.hostRequired.includes(p)),
    hostRequiredRemoved: prev.hostRequired.filter(p => !cur.hostRequired.includes(p)),
    hostOptionalAdded:   cur.hostOptional.filter(p => !prev.hostOptional.includes(p)),
    hostOptionalRemoved: prev.hostOptional.filter(p => !cur.hostOptional.includes(p)),
  };
}

export function auditPermissions(manifestPerms, docPerms) {
  const issues = [];
  // Missing-first (most actionable: manifest declares it, doc doesn't justify).
  for (const p of manifestPerms.required) {
    if (!docPerms.required.includes(p)) issues.push({ kind: 'missing-required-justification', perm: p });
  }
  for (const p of manifestPerms.optional) {
    if (!docPerms.optional.includes(p)) issues.push({ kind: 'missing-optional-justification', perm: p });
  }
  for (const p of (manifestPerms.hostRequired || [])) {
    if (!(docPerms.hostRequired || []).includes(p)) issues.push({ kind: 'missing-host-justification', perm: p });
  }
  for (const p of (manifestPerms.hostOptional || [])) {
    if (!(docPerms.hostOptional || []).includes(p)) issues.push({ kind: 'missing-host-justification', perm: p });
  }
  // Then stale (doc still describes a permission no longer in the manifest).
  for (const p of docPerms.required) {
    if (!manifestPerms.required.includes(p)) issues.push({ kind: 'stale-required-justification', perm: p });
  }
  for (const p of docPerms.optional) {
    if (!manifestPerms.optional.includes(p)) issues.push({ kind: 'stale-optional-justification', perm: p });
  }
  for (const p of (docPerms.hostRequired || [])) {
    if (!(manifestPerms.hostRequired || []).includes(p)) issues.push({ kind: 'stale-host-justification', perm: p });
  }
  for (const p of (docPerms.hostOptional || [])) {
    if (!(manifestPerms.hostOptional || []).includes(p)) issues.push({ kind: 'stale-host-justification', perm: p });
  }
  return issues;
}

/**
 * Classify a Submitted-date string against a "now" reference time.
 *
 * Returns one of:
 *   { status: 'pass',    detail: '<canonical iso>' }
 *   { status: 'fail',    detail: 'unparseable: "..."'      }   // junk / typo
 *   { status: 'fail',    detail: '<n> day(s) in the future' } // future-dated
 *   { status: 'warn',    detail: '<n> days old (>365)'      } // stale
 *
 * Pure (no I/O); takes `now` so tests can pin the clock.
 *
 * @param {string} raw    The string after `> Submitted: ` in the doc.
 * @param {Date}   now    Reference "today" — defaults to new Date().
 * @returns {{ status: 'pass'|'warn'|'fail', detail: string, parsed?: Date, ageDays?: number }}
 */
export function classifySubmittedDate(raw, now = new Date()) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { status: 'fail', detail: 'unparseable: "" (empty)' };
  }
  const trimmed = raw.trim();
  const ts = Date.parse(trimmed);
  if (!Number.isFinite(ts)) {
    return { status: 'fail', detail: `unparseable: "${trimmed}"` };
  }
  const parsed = new Date(ts);
  // Compare on a whole-day grid in *local* time (not UTC) so that a date
  // written by the operator like "April 24, 2026" — parsed as local midnight
  // — and a reference "now" parsed from an ISO string don't end up on the
  // wrong side of the date line in non-UTC timezones (e.g. IST = UTC+5:30).
  const dayMs = 86_400_000;
  const localDay = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const ageDays = Math.round((localDay(now) - localDay(parsed)) / dayMs);

  if (ageDays < 0) {
    return { status: 'fail', detail: `${Math.abs(ageDays)} day(s) in the future`, parsed, ageDays };
  }
  if (ageDays > 365) {
    return { status: 'warn', detail: `${ageDays} days old (>365) — likely a stale doc`, parsed, ageDays };
  }
  return { status: 'pass', detail: trimmed, parsed, ageDays };
}

/**
 * Extract a single version's body from a CHANGELOG.md.
 *
 * Looks for a `## [X.Y.Z]` header (with optional `- date` suffix), then
 * captures every subsequent line until the next `## [` boundary or a
 * standalone `---` divider (whichever comes first).
 *
 * Returns:
 *   { found: false }                                 — header not present
 *   { found: true,  body: string, headerLine: string }
 *
 * Pure (no I/O); takes the full CHANGELOG text as a string.
 *
 * @param {string} text     The full CHANGELOG.md contents.
 * @param {string} version  The version string (e.g. "9.2.0").
 * @returns {{ found: false } | { found: true, body: string, headerLine: string }}
 */
export function extractChangelogSection(text, version) {
  if (typeof text !== 'string' || typeof version !== 'string') return { found: false };
  const escaped = version.replace(/\./g, '\\.');
  const headerRe = new RegExp(`^## \\[${escaped}\\][^\\n]*$`, 'm');
  const headerMatch = text.match(headerRe);
  if (!headerMatch) return { found: false };
  const startIdx = headerMatch.index + headerMatch[0].length;
  const remainder = text.slice(startIdx);
  // Stop at the next `## [` header OR a stand-alone `---` divider.
  const stopRe = /^(## \[|---\s*$)/m;
  const stopMatch = remainder.match(stopRe);
  const body = stopMatch ? remainder.slice(0, stopMatch.index) : remainder;
  return { found: true, body, headerLine: headerMatch[0] };
}

/**
 * Classify a CHANGELOG section body as 'pass' or 'fail' for the content check.
 *
 * Rules:
 *   - Trim whitespace.
 *   - Strip empty `### Heading` subsection markers (a bare `### Features`
 *     with no bullets is just template noise, not real content).
 *   - If anything substantive remains, it's 'pass'. Otherwise 'fail' with a
 *     short explanation.
 *
 * Pure helper.
 *
 * @param {string} body  The section body returned by extractChangelogSection.
 * @returns {{ status: 'pass'|'fail', detail: string }}
 */
export function classifyChangelogBody(body) {
  if (typeof body !== 'string' || body.trim() === '') {
    return { status: 'fail', detail: 'section is empty (header only)' };
  }
  // Drop blank lines and bare `### ...` subsection headers; if everything
  // that remains is whitespace, the section has no real content.
  const meaningful = body
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== '' && !/^###\s+/.test(l));
  if (meaningful.length === 0) {
    return { status: 'fail', detail: 'section has only subsection headers, no bullets/prose' };
  }
  return { status: 'pass', detail: `${meaningful.length} content line(s)` };
}

// ---------- check mode ----------

async function runChecks() {
  const results = [];
  const record = (name, status, detail, extra = {}) => {
    results.push({ name, status, detail, ...extra });
  };

  // 0. Version parity (manifest.json vs package.json). Cheap, no remote, and
  // catches the class of bugs where sync-version was bypassed (manual edit,
  // botched merge). Defers to scripts/sync-version.mjs --check as the single
  // source of truth so the parity rule lives in one place.
  try {
    runSilent('node scripts/sync-version.mjs --check');
    record('manifest <-> package version parity', 'pass', `both at ${pkg.version}`);
  } catch (err) {
    const tail = (err && err.stderrTail) ? err.stderrTail : (err && err.message) || 'unknown error';
    record('manifest <-> package version parity', 'fail', tail.split(/\r?\n/)[0]);
  }

  // 1. Local submission doc exists.
  const submissionPath = resolve(SUBMISSIONS_DIR, `v${version}-chrome-web-store.md`);
  const hasDoc = existsSync(submissionPath);
  record(
    'submission-doc exists',
    hasDoc ? 'pass' : 'fail',
    hasDoc ? submissionPath.replace(ROOT, '.') : `missing: docs/store-submissions/v${version}-chrome-web-store.md`,
  );

  // 2. Submission doc has a real Submitted date.
  let submittedDate = null;
  if (hasDoc) {
    const doc = readFileSync(submissionPath, 'utf-8');
    const m = doc.match(/^> Submitted:\s*(.+)$/m);
    const raw = m ? m[1].trim() : '';
    if (/TBD/i.test(raw) || raw === '') {
      record('submission-doc Submitted date', 'fail', `still "${raw || 'missing'}" — fill in after upload`);
    } else {
      submittedDate = raw;
      record('submission-doc Submitted date', 'pass', raw);
      // 2b. Sanity: parseable, not in the future, not absurdly stale. A future
      // date is almost always a typo (operator typed next year by mistake);
      // a >365-day-old date usually means the doc was scaffolded ages ago and
      // the operator forgot to refresh it before re-submission.
      const verdict = classifySubmittedDate(raw);
      record('submission-doc Submitted date sanity', verdict.status, verdict.detail);
    }
  } else {
    record('submission-doc Submitted date', 'fail', '(submission doc missing)');
  }

  // 3. Release zip exists.
  // Canonical home is `release/zips/` (v9.1.0+). Legacy zips for v9.0.0 and
  // earlier still live at `release/` root — accept either to keep historical
  // checks (`npm run store check 9.0.0`) green.
  const zipName = `smruti-cortex-v${version}.zip`;
  const zipCanonical = resolve(RELEASE_DIR, 'zips', zipName);
  const zipLegacy = resolve(RELEASE_DIR, zipName);
  const zipPath = existsSync(zipCanonical) ? zipCanonical : existsSync(zipLegacy) ? zipLegacy : null;
  if (zipPath) {
    const rel = zipPath.replace(ROOT, '.').replace(/\\/g, '/').replace(/^\.\//, '');
    record('release zip exists', 'pass', rel);
  } else {
    record(
      'release zip exists',
      'warn',
      `missing: release/zips/${zipName} (or legacy release/${zipName}) — re-run npm run package if needed`,
    );
  }

  // 4. CHANGELOG has a matching entry — header present AND has real content.
  const changelog = readFileSync(CHANGELOG_PATH, 'utf-8');
  const section = extractChangelogSection(changelog, version);
  if (!section.found) {
    record('CHANGELOG entry', 'fail', `no [${version}] section in CHANGELOG.md`);
  } else {
    record('CHANGELOG entry', 'pass', `[${version}] found`);
    // 4a. The header alone is meaningless — every release deserves a body.
    // Catches the v9.0.0-class bug where the release tag was pushed but the
    // CHANGELOG section was an empty stub (header only) the operator
    // intended to fill in later and forgot.
    const verdict = classifyChangelogBody(section.body);
    record('CHANGELOG entry content', verdict.status, verdict.detail);
  }

  // 4b. Manifest <-> submission doc permission parity.
  // Catches the v9.2.0 `idle` regression class: a permission silently added
  // (or removed) in manifest.json without a corresponding update to the
  // submission doc's Section 4. Reviewers reject when permissions appear
  // unexplained, so this is treated as a hard fail.
  if (hasDoc) {
    try {
      const manifestJson = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
      const docText = readFileSync(submissionPath, 'utf-8');
      const issues = auditPermissions(parseManifestPermissions(manifestJson), parseDocPermissions(docText));
      if (issues.length === 0) {
        record('manifest <-> doc permission parity', 'pass', 'all manifest permissions have justifications');
      } else {
        const lines = issues.map(i => {
          switch (i.kind) {
            case 'missing-required-justification':
              return `MISSING required justification for \`${i.perm}\` (declared in manifest.permissions but no Section 4 entry)`;
            case 'missing-optional-justification':
              return `MISSING optional justification for \`${i.perm}\` (declared in manifest.optional_permissions but no Section 4 entry)`;
            case 'stale-required-justification':
              return `STALE required justification for \`${i.perm}\` (has Section 4 entry but not in manifest.permissions)`;
            case 'stale-optional-justification':
              return `STALE optional justification for \`${i.perm}\` (has Section 4 entry but not in manifest.optional_permissions)`;
            default:
              return `UNKNOWN issue: ${JSON.stringify(i)}`;
          }
        });
        record('manifest <-> doc permission parity', 'fail', `${issues.length} issue(s):\n      - ${lines.join('\n      - ')}`);
      }
    } catch (err) {
      record('manifest <-> doc permission parity', 'warn', `audit skipped: ${err.message}`);
    }
  } else {
    record('manifest <-> doc permission parity', 'fail', '(submission doc missing — cannot audit)');
  }

  // 5 + 6. Public CWS fetch.
  let store = null;
  if (!NO_REMOTE) {
    store = await fetchStore();
    if (!store || store.error) {
      record('public store reachable', 'warn', store?.error ? `fetch failed: ${store.error}` : 'no response');
    } else {
      record('public store reachable', 'pass', STORE_URL);

      if (store.version) {
        const match = store.version === version;
        record(
          'public store version',
          match ? 'pass' : 'fail',
          match ? `v${store.version} (matches expected)` : `expected v${version}, store shows v${store.version}`,
        );
      } else {
        record('public store version', 'warn', 'could not extract version from public listing');
      }

      if (store.updated) record('public store updated date', 'info', store.updated);
      if (store.size) record('public store bundle size', 'info', store.size);
      if (store.users) record('public store user count', 'info', `${store.users} users`);

      if (store.whatsNewVersion) {
        const stale = store.whatsNewVersion !== version;
        record(
          'public store "What\'s New" freshness',
          stale ? 'fail' : 'pass',
          stale
            ? `public listing references "New in v${store.whatsNewVersion}" but current is v${version} — update the "Changes in this version" field on the dashboard`
            : `mentions v${store.whatsNewVersion} (matches)`,
        );
      } else {
        record('public store "What\'s New" freshness', 'warn', 'no "New in vX.Y.Z" marker found in listing — cannot verify');
      }
    }
  } else {
    record('public store reachable', 'info', 'skipped (--no-remote)');
  }

  // ---------- render ----------

  // In --strict mode, every WARN is treated as a FAIL. Mutate the result rows
  // (recording the original status under `originalStatus`) so the JSON output
  // and the pretty render both reflect the promotion consistently.
  if (STRICT_MODE) {
    for (const r of results) {
      if (r.status === 'warn') {
        r.originalStatus = 'warn';
        r.status = 'fail';
        r.detail = `${r.detail} [strict: promoted from warn]`;
      }
    }
  }

  const failed = results.filter(r => r.status === 'fail').length;
  const warned = results.filter(r => r.status === 'warn').length;

  if (JSON_MODE) {
    // schemaVersion 1 — documented contract for `store check --json`.
    // CI / automation should pin to this version and degrade gracefully on
    // unknown keys. Future breaking changes (key removed, semantics flipped)
    // bump this number. Additive changes (new keys, new result fields) keep
    // schemaVersion: 1 — clients must ignore unknown keys.
    //
    // See the file header for the canonical schema description.
    const passed = results.filter(r => r.status === 'pass').length;
    const info = results.filter(r => r.status === 'info').length;
    console.log(JSON.stringify({
      schemaVersion: 1,
      version,
      vTag,
      storeUrl: STORE_URL,
      submittedDate,
      strict: STRICT_MODE,
      noRemote: NO_REMOTE,
      public: store,
      results,
      summary: { failed, warned, passed, info, total: results.length, exitCode: failed > 0 ? 1 : 0 },
    }, null, 2));
  } else if (VERBOSE) {
    // Long-form output: header banner + per-check rows + footer divider.
    console.log('='.repeat(72));
    console.log(`  SmrutiCortex store check — ${vTag}`);
    console.log(`  Expected: v${version}   Store URL: ${STORE_URL}`);
    console.log('='.repeat(72));
    for (const r of results) {
      console.log(fmt(r.status, r.name, r.detail));
    }
    console.log('-'.repeat(72));
    if (failed > 0) {
      console.log(`  ${failed} failed, ${warned} warnings. Fix the failures above.`);
    } else if (warned > 0) {
      console.log(`  All critical checks passed (${warned} warnings — review when convenient).`);
    } else {
      console.log(`  All checks passed.`);
    }
    console.log('='.repeat(72));
  } else {
    // Swift default (T1): one row per check, then a single outcome line.
    // No banner, no dividers — operators glancing at a CI log see the
    // signal immediately. --verbose / -v restores the long form.
    for (const r of results) {
      console.log(fmt(r.status, r.name, r.detail));
    }
    if (failed > 0) {
      console.log(`store check (${vTag}): ${failed} failed, ${warned} warning(s). Fix the failures above.`);
    } else if (warned > 0) {
      console.log(`store check (${vTag}): pass with ${warned} warning(s).`);
    } else {
      console.log(`store check (${vTag}): all checks passed.`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

// ---------- entry ----------

if (invokedAsMain) {
  if (INIT_MODE) {
    if (!explicitVersion) {
      console.error('[fatal] --init requires an explicit version (e.g. `node scripts/store-check.mjs 9.2.0 --init`).');
      process.exit(2);
    }
    initSubmissionDoc(explicitVersion, { dryRun: INIT_DRY_RUN, force: INIT_FORCE });
  } else {
    await runChecks();
  }
}
