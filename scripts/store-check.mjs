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
 *   node scripts/store-check.mjs --json             # machine-readable output
 *   node scripts/store-check.mjs --no-remote        # skip CWS fetch (offline)
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
const explicitVersion = args.find(a => /^\d+\.\d+\.\d+$/.test(a));

function runSilent(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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

async function fetchStore() {
  if (NO_REMOTE) return null;
  try {
    const res = await fetch(STORE_URL, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 smruti-cortex-store-check',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
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
    return { error: err.message };
  }
}

// ---------- init mode ----------

function initSubmissionDoc(newVersion) {
  const prev = listPrevVersion(newVersion);
  if (!prev) {
    console.error(`[fatal] Cannot scaffold — no previous released tag found before v${newVersion}.`);
    process.exit(2);
  }
  const prevDoc = resolve(SUBMISSIONS_DIR, `v${prev}-chrome-web-store.md`);
  const newDoc = resolve(SUBMISSIONS_DIR, `v${newVersion}-chrome-web-store.md`);
  if (existsSync(newDoc)) {
    console.error(`[fatal] ${newDoc} already exists. Refusing to overwrite.`);
    process.exit(2);
  }
  if (!existsSync(prevDoc)) {
    console.error(`[fatal] Previous submission doc not found: ${prevDoc}`);
    process.exit(2);
  }

  const today = new Date().toISOString().slice(0, 10);
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

  let scaffolded = prevContent
    .replace(/# Chrome Web Store Submission — SmrutiCortex v[\d.]+/, `# Chrome Web Store Submission — SmrutiCortex v${newVersion}`)
    .replace(/> Version: [\d.]+/, `> Version: ${newVersion}`)
    .replace(/> Released \(tagged\): [\d-]+/, `> Released (tagged): ${today}`)
    .replace(/> Drafted: [\d-]+/, `> Drafted: ${today}`)
    .replace(/> Submitted: [^\n]+/, `> Submitted: _TBD — fill in after upload_`)
    .replace(/> Package: `release\/(zips\/)?smruti-cortex-v[\d.]+\.zip`/, `> Package: \`release/zips/smruti-cortex-v${newVersion}.zip\``)
    .replace(/> Previous version: v[\d.]+/, `> Previous version: v${prev}`);

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

  // Append a scaffolding hint at the top so the operator knows what still needs editing.
  const preamble = `<!--\n  SCAFFOLDED by scripts/store-check.mjs --init on ${today}.\n  TODO before submission:\n    1. Fill in Submitted date once uploaded.\n    2. Review Section 7 (Changes from Previous Submission) — the git log\n       below is a raw dump; rewrite into categorised prose.\n    3. If any permission was added/removed, follow the PERMISSION DELTA\n       banner below to update Section 4 (the \`npm run store check\` audit\n       will fail until you do).\n    4. Delete this comment block.\n${permBannerLines.join('\n')}\n\n  Raw git log v${prev}..v${newVersion}:\n${gitLog.split('\n').map(l => '    ' + l).join('\n')}\n-->\n\n`;

  scaffolded = preamble + scaffolded;

  writeFileSync(newDoc, scaffolded, 'utf-8');
  console.log(`[ok] Scaffolded ${newDoc}`);
  console.log(`[info] Base: v${prev} → Target: v${newVersion}`);
  console.log(`[info] Inserted a TODO preamble with the raw git log. Rewrite Section 7 before submitting.`);
}

// ---------- permission audit (pure helpers, exported for unit tests) ----------

/**
 * Extract the declared permission lists from a parsed manifest.json.
 *
 * Returns an object with `required` and `optional` string arrays in their
 * original manifest declaration order. Missing arrays are normalised to `[]`
 * so callers never have to null-check.
 *
 * @param {object} manifestJson  The parsed contents of manifest.json.
 * @returns {{required: string[], optional: string[]}}
 */
export function parseManifestPermissions(manifestJson) {
  const required = Array.isArray(manifestJson?.permissions) ? [...manifestJson.permissions] : [];
  const optional = Array.isArray(manifestJson?.optional_permissions) ? [...manifestJson.optional_permissions] : [];
  return { required, optional };
}

/**
 * Extract the permission names that have a `#### \`<perm>\`` heading inside
 * the "### Required Permissions" / "### Optional Permissions" subsections of
 * the submission doc's Section 4.
 *
 * Recognises:
 *   #### `idle`
 *   #### `idle` *(new in v9.2.0)*
 *
 * Stops scanning a subsection at the next `### `, `## `, or `---` boundary.
 * "### Optional Host Permissions" is intentionally NOT walked — host
 * permissions are audited separately (and the manifest field name differs).
 *
 * @param {string} docText  Full markdown text of vX.Y.Z-chrome-web-store.md.
 * @returns {{required: string[], optional: string[]}}
 */
export function parseDocPermissions(docText) {
  const required = [];
  const optional = [];
  let mode = null;
  for (const line of docText.split(/\r?\n/)) {
    if (/^###\s+Required Permissions\b/.test(line))         { mode = 'required'; continue; }
    if (/^###\s+Optional Permissions\b/.test(line))         { mode = 'optional'; continue; }
    if (/^###\s+Optional Host Permissions\b/.test(line))    { mode = null;       continue; }
    if (/^##\s+/.test(line) || /^###\s+/.test(line) || /^---\s*$/.test(line)) { mode = null; continue; }
    if (!mode) continue;
    const m = line.match(/^####\s+`([^`]+)`/);
    if (m) (mode === 'required' ? required : optional).push(m[1]);
  }
  return { required, optional };
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
    requiredAdded:   cur.required.filter(p => !prev.required.includes(p)),
    requiredRemoved: prev.required.filter(p => !cur.required.includes(p)),
    optionalAdded:   cur.optional.filter(p => !prev.optional.includes(p)),
    optionalRemoved: prev.optional.filter(p => !cur.optional.includes(p)),
  };
}

export function auditPermissions(manifestPerms, docPerms) {
  const issues = [];
  for (const p of manifestPerms.required) {
    if (!docPerms.required.includes(p)) issues.push({ kind: 'missing-required-justification', perm: p });
  }
  for (const p of manifestPerms.optional) {
    if (!docPerms.optional.includes(p)) issues.push({ kind: 'missing-optional-justification', perm: p });
  }
  for (const p of docPerms.required) {
    if (!manifestPerms.required.includes(p)) issues.push({ kind: 'stale-required-justification', perm: p });
  }
  for (const p of docPerms.optional) {
    if (!manifestPerms.optional.includes(p)) issues.push({ kind: 'stale-optional-justification', perm: p });
  }
  return issues;
}

// ---------- check mode ----------

async function runChecks() {
  const results = [];
  const record = (name, status, detail, extra = {}) => {
    results.push({ name, status, detail, ...extra });
  };

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

  // 4. CHANGELOG has a matching entry.
  const changelog = readFileSync(CHANGELOG_PATH, 'utf-8');
  const hasChangelogEntry = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(changelog);
  record(
    'CHANGELOG entry',
    hasChangelogEntry ? 'pass' : 'fail',
    hasChangelogEntry ? `[${version}] found` : `no [${version}] section in CHANGELOG.md`,
  );

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

  const failed = results.filter(r => r.status === 'fail').length;
  const warned = results.filter(r => r.status === 'warn').length;

  if (JSON_MODE) {
    console.log(JSON.stringify({
      version,
      vTag,
      storeUrl: STORE_URL,
      submittedDate,
      public: store,
      results,
      summary: { failed, warned, passed: results.filter(r => r.status === 'pass').length },
    }, null, 2));
  } else {
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
    initSubmissionDoc(explicitVersion);
  } else {
    await runChecks();
  }
}
