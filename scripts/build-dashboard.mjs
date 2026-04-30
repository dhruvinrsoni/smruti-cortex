#!/usr/bin/env node
/**
 * build-dashboard.mjs — Generate the Quality Report HTML dashboard.
 *
 * Used by .github/workflows/health-check.yml to produce a self-contained
 * report bundled into the `smruti-cortex-health-bundle` artifact. Download
 * the artifact and open `dashboard/index.html` to view it.
 *
 * NOT published to GitHub Pages. The Pages source is intentionally kept on
 * "Deploy from a branch (main / docs/)" so the marketing site + the
 * CWS-required privacy policy at /privacy.html are served straight from
 * `docs/` on main and never depend on this workflow running successfully.
 * See the rationale in `.github/workflows/health-check.yml` header comment.
 *
 * Also runnable locally to preview the dashboard before pushing — extracts
 * from coverage/coverage-summary.json, optional nfr-reports/audit.json,
 * optional lint-report.json, and dist/ bundle sizes.
 *
 * Inputs (auto-discovered, optional unless noted):
 *   coverage/coverage-summary.json   — vitest --coverage output (REQUIRED)
 *   coverage/lcov.info               — fallback if summary.json missing
 *   nfr-reports/audit.json           — `npm audit --json` output (optional)
 *   lint-report.json                 — eslint --format json output (optional)
 *   dist/background/service-worker.js, dist/popup/popup.js,
 *   dist/content_scripts/quick-search.js — bundle size measurements
 *
 * Env-var overrides (CI uses these; local runs ignore):
 *   COVERAGE_DELTA, BASELINE_COVERAGE — only available in CI (requires
 *                                       baseline worktree); blank locally
 *   GITHUB_REPOSITORY, GITHUB_REF_NAME, GITHUB_RUN_ID, GITHUB_RUN_NUMBER
 *
 * Outputs (under --out, default: dashboard/):
 *   index.html          — main dashboard
 *   summary.json        — machine-readable scorecard
 *   coverage/           — vitest HTML coverage (when --copy-coverage passed)
 *
 * Local preview:
 *
 *   npm run coverage
 *   node scripts/build-dashboard.mjs --copy-coverage
 *   # then open dashboard/index.html
 *
 * Usage:
 *   node scripts/build-dashboard.mjs                  # writes dashboard/
 *   node scripts/build-dashboard.mjs --out site       # writes site/
 *   node scripts/build-dashboard.mjs --copy-coverage  # also copies coverage/* HTML
 *   node scripts/build-dashboard.mjs --help
 *
 * Exit codes:
 *   0 — dashboard written.
 *   1 — required input missing or write failure.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, copyFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve, join, relative } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

function tryReadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function fileSizeBytes(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function copyDirRecursive(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else copyFileSync(s, d);
  }
}

function readCoveragePct() {
  const summaryPath = resolve(rootDir, 'coverage/coverage-summary.json');
  const lcovPath = resolve(rootDir, 'coverage/lcov.info');
  const summary = tryReadJson(summaryPath);
  if (summary && typeof summary.total?.lines?.pct === 'number') {
    return { pct: String(summary.total.lines.pct), source: 'summary' };
  }
  if (existsSync(lcovPath)) {
    const content = readFileSync(lcovPath, 'utf-8');
    let lf = 0, lh = 0;
    for (const line of content.split(/\r?\n/)) {
      if (line.startsWith('LF:')) lf += Number(line.slice(3)) || 0;
      if (line.startsWith('LH:')) lh += Number(line.slice(3)) || 0;
    }
    if (lf > 0) return { pct: ((lh * 100) / lf).toFixed(2), source: 'lcov' };
  }
  return { pct: 'n/a', source: 'none' };
}

function readAuditCounts() {
  const path = resolve(rootDir, 'nfr-reports/audit.json');
  const data = tryReadJson(path);
  const v = data?.metadata?.vulnerabilities || {};
  return {
    total: Number(v.total || 0),
    critical: Number(v.critical || 0),
    high: Number(v.high || 0),
    moderate: Number(v.moderate || 0),
    low: Number(v.low || 0),
  };
}

function readLintCounts() {
  const path = resolve(rootDir, 'lint-report.json');
  const data = tryReadJson(path);
  if (!Array.isArray(data)) return { errors: 0, warnings: 0, available: false };
  return {
    errors: data.reduce((s, f) => s + (f.errorCount || 0), 0),
    warnings: data.reduce((s, f) => s + (f.warningCount || 0), 0),
    available: true,
  };
}

function readBundleSizes() {
  const swPath = resolve(rootDir, 'dist/background/service-worker.js');
  const popupPath = resolve(rootDir, 'dist/popup/popup.js');
  const qsPath = resolve(rootDir, 'dist/content_scripts/quick-search.js');
  const sw = fileSizeBytes(swPath);
  const popup = fileSizeBytes(popupPath);
  const qs = fileSizeBytes(qsPath);
  let totalJs = 0;
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.js')) totalJs += fileSizeBytes(p);
    }
  }
  walk(resolve(rootDir, 'dist'));
  return {
    sw,
    popup,
    qs,
    totalJs,
  };
}

function classifyStatus({ lint, coverage, audit, hasDist }) {
  return {
    lint: lint.available ? (lint.errors === 0 ? 'pass' : 'warn') : 'unknown',
    tests: coverage.pct === 'n/a' ? 'unknown' : 'pass',
    coverage: coverage.pct === 'n/a' ? 'unknown' : (Number(coverage.pct) >= 80 ? 'pass' : 'warn'),
    security: audit.critical === 0 && audit.high === 0 ? 'pass' : 'warn',
    performance: hasDist ? 'pass' : 'unknown',
  };
}

function topActions(data) {
  const actions = [];
  if (data.lintErrors > 0) actions.push(`Fix ${data.lintErrors} lint errors before next release.`);
  if (data.auditCritical > 0 || data.auditHigh > 0) actions.push(`Prioritize security updates (${data.auditCritical} critical, ${data.auditHigh} high).`);
  if (data.coverageLinesPct !== 'n/a' && Number(data.coverageLinesPct) < 75) actions.push(`Increase line coverage (current ${data.coverageLinesPct}%).`);
  if (data.coverageLinesPct === 'n/a') actions.push('Coverage data unavailable: run `npm run coverage` first.');
  if (data.totalJsKb > 900) actions.push(`Reduce bundle size (current total ${data.totalJsKb} KB).`);
  if (actions.length === 0) actions.push('No urgent action detected. Maintain current quality trend.');
  return actions;
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const toCoverageLabel = (pct) => (pct === 'n/a' ? 'n/a' : `${pct}%`);

function buildHtml(data, status, actions) {
  const chip = (label, st) => {
    const cls = st === 'pass' ? 'chip pass' : st === 'warn' ? 'chip warn' : 'chip unknown';
    return `<span class="${cls}">${esc(label)}: ${esc(st)}</span>`;
  };

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <title>SmrutiCortex — Quality Report</title>',
    '  <style>',
    '    :root { --bg: #f6f8fb; --card: #ffffff; --ink: #0f172a; --muted: #475569; --line: #dbe3ee; --accent: #0f766e; --warn: #b45309; --pass: #166534; --unknown: #334155; }',
    '    body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; background: linear-gradient(180deg, #eff4ff 0%, #f6f8fb 45%); color: var(--ink); }',
    '    .wrap { max-width: 980px; margin: 0 auto; padding: 28px 16px 36px; }',
    '    .hero { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px; box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06); }',
    '    h1 { margin: 0; font-size: 30px; }',
    '    h2 { margin: 0 0 10px; font-size: 20px; }',
    '    .meta { color: var(--muted); margin-top: 8px; font-size: 14px; }',
    '    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }',
    '    .chip { border-radius: 999px; padding: 4px 10px; font-size: 12px; border: 1px solid transparent; }',
    '    .chip.pass { color: var(--pass); border-color: #86efac; background: #f0fdf4; }',
    '    .chip.warn { color: var(--warn); border-color: #fcd34d; background: #fffbeb; }',
    '    .chip.unknown { color: var(--unknown); border-color: #cbd5e1; background: #f8fafc; }',
    '    .grid { margin-top: 18px; display: grid; gap: 14px; grid-template-columns: 1fr; }',
    '    .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }',
    '    table { border-collapse: collapse; width: 100%; margin-top: 8px; }',
    '    th, td { border: 1px solid var(--line); padding: 8px 10px; text-align: left; }',
    '    th { background: #f8fafc; }',
    '    ul { margin: 8px 0 0 18px; }',
    '    a { color: var(--accent); text-decoration: none; }',
    '    a:hover { text-decoration: underline; }',
    '    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-top: 14px; }',
    '    .kpi { background: #f8fafc; border: 1px solid var(--line); border-radius: 10px; padding: 10px; }',
    '    .kpi .label { color: var(--muted); font-size: 12px; }',
    '    .kpi .value { font-size: 22px; font-weight: 700; margin-top: 4px; }',
    '    @media (max-width: 680px) { .wrap { padding: 16px 12px 24px; } h1 { font-size: 24px; } }',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="wrap">',
    '    <section class="hero">',
    '      <h1>SmrutiCortex — Quality Report</h1>',
    `      <p class="meta">Generated: ${esc(data.generatedAt)} | Run #${esc(data.runNumber || 'local')} | Ref: ${esc(data.ref || 'local')} | Coverage source: ${esc(data.coverageSource)}</p>`,
    data.runId ? `      <p class="meta"><a href="https://github.com/${esc(data.repository)}/actions/runs/${esc(data.runId)}" target="_blank" rel="noopener">Open workflow run details</a></p>` : '',
    `      <div class="chips">${chip('Lint', status.lint)}${chip('Tests', status.tests)}${chip('Coverage', status.coverage)}${chip('Security', status.security)}${chip('Performance', status.performance)}</div>`,
    '      <p class="meta"><a href="./coverage/index.html">Coverage details (HTML)</a></p>',
    '      <div class="kpis">',
    `        <div class="kpi"><div class="label">Coverage</div><div class="value">${esc(toCoverageLabel(data.coverageLinesPct))}</div></div>`,
    `        <div class="kpi"><div class="label">Lint Errors</div><div class="value">${esc(data.lintErrors)}</div></div>`,
    `        <div class="kpi"><div class="label">Critical/High Vulns</div><div class="value">${esc(data.auditCritical + data.auditHigh)}</div></div>`,
    `        <div class="kpi"><div class="label">Total JS Bundle</div><div class="value">${esc(data.totalJsKb)} KB</div></div>`,
    '      </div>',
    '    </section>',
    '    <section class="grid">',
    '      <article class="card">',
    '        <h2>Signals</h2>',
    '        <table>',
    '          <tr><th>Area</th><th>Status</th><th>Signal</th></tr>',
    `          <tr><td>Coverage</td><td>${esc(status.coverage)}</td><td>${esc(toCoverageLabel(data.coverageLinesPct))} (delta ${esc(data.coverageDelta)}%)</td></tr>`,
    `          <tr><td>Lint</td><td>${esc(status.lint)}</td><td>${esc(data.lintErrors)} errors, ${esc(data.lintWarnings)} warnings</td></tr>`,
    `          <tr><td>Security</td><td>${esc(status.security)}</td><td>${esc(data.auditTotal)} total, ${esc(data.auditCritical)} critical, ${esc(data.auditHigh)} high</td></tr>`,
    `          <tr><td>Performance</td><td>${esc(status.performance)}</td><td>Total JS ${esc(data.totalJsKb)} KB</td></tr>`,
    '        </table>',
    '      </article>',
    '      <article class="card">',
    '        <h2>Top Actions</h2>',
    `        <ul>${actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`,
    '      </article>',
    '      <article class="card">',
    '        <h2>Bundle Sizes</h2>',
    '        <table>',
    '          <tr><th>Bundle</th><th>Size</th><th>Target</th></tr>',
    `          <tr><td>Service Worker</td><td>${esc(data.swKb)} KB</td><td>&lt; 500 KB</td></tr>`,
    `          <tr><td>Popup</td><td>${esc(data.popupKb)} KB</td><td>&lt; 300 KB</td></tr>`,
    `          <tr><td>Quick Search</td><td>${esc(data.qsKb)} KB</td><td>&lt; 200 KB</td></tr>`,
    '        </table>',
    '      </article>',
    '    </section>',
    '  </div>',
    '</body>',
    '</html>'
  ].filter(Boolean).join('\n');
}

function parseArgs(argv) {
  const out = { outDir: 'dashboard', copyCoverage: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '--out') out.outDir = argv[++i];
    else if (a === '--copy-coverage') out.copyCoverage = true;
  }
  return out;
}

const invokedAsMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsMain) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`Usage: node scripts/build-dashboard.mjs [--out <dir>] [--copy-coverage]

Defaults:
  --out             dashboard
  --copy-coverage   off (when on, copies coverage/* into <out>/coverage/)

Auto-discovers inputs from coverage/, nfr-reports/, lint-report.json, dist/.
CI environment variables (GITHUB_REPOSITORY, GITHUB_REF_NAME, GITHUB_RUN_ID,
GITHUB_RUN_NUMBER, COVERAGE_DELTA, BASELINE_COVERAGE) are picked up if set.`);
    process.exit(0);
  }

  const outDir = resolve(rootDir, args.outDir);
  mkdirSync(outDir, { recursive: true });

  const coverage = readCoveragePct();
  const audit = readAuditCounts();
  const lint = readLintCounts();
  const bundle = readBundleSizes();
  const hasDist = bundle.totalJs > 0;

  const data = {
    generatedAt: new Date().toISOString(),
    repository: process.env.GITHUB_REPOSITORY || 'local',
    ref: process.env.GITHUB_REF_NAME || 'local',
    runId: process.env.GITHUB_RUN_ID || '',
    runNumber: process.env.GITHUB_RUN_NUMBER || '',
    coverageLinesPct: coverage.pct,
    coverageSource: coverage.source,
    coverageDelta: process.env.COVERAGE_DELTA || 'n/a',
    coverageBaseline: process.env.BASELINE_COVERAGE || 'n/a',
    lintErrors: lint.errors,
    lintWarnings: lint.warnings,
    auditTotal: audit.total,
    auditCritical: audit.critical,
    auditHigh: audit.high,
    auditModerate: audit.moderate,
    auditLow: audit.low,
    swKb: Math.floor(bundle.sw / 1024),
    popupKb: Math.floor(bundle.popup / 1024),
    qsKb: Math.floor(bundle.qs / 1024),
    totalJsKb: Math.floor(bundle.totalJs / 1024),
  };

  const status = classifyStatus({ lint, coverage, audit, hasDist });
  const actions = topActions(data);

  const summary = { generatedAt: data.generatedAt, data, status, actions };

  try {
    writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
    writeFileSync(join(outDir, 'index.html'), buildHtml(data, status, actions), 'utf-8');
  } catch (err) {
    console.error(`[build-dashboard] ERROR: failed to write to ${outDir}: ${err.message}`);
    process.exit(1);
  }

  if (args.copyCoverage) {
    const covSrc = resolve(rootDir, 'coverage');
    const covDst = join(outDir, 'coverage');
    try {
      copyDirRecursive(covSrc, covDst);
    } catch (err) {
      console.error(`[build-dashboard] WARN: failed to copy coverage/ HTML: ${err.message}`);
    }
  }

  console.log(`[build-dashboard] wrote ${relative(rootDir, outDir).replace(/\\/g, '/')}/index.html (coverage: ${data.coverageLinesPct}, lint errors: ${data.lintErrors}, vulns: ${data.auditCritical + data.auditHigh})`);
  process.exit(0);
}
