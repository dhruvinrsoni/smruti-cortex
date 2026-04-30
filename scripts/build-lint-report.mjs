#!/usr/bin/env node
/**
 * build-lint-report.mjs — Convert lint-report.json into LLM-friendly Markdown.
 *
 * Used by .github/workflows/health-check.yml (and the manual lint-report.yml
 * workflow) to produce a human/LLM-readable digest of ESLint output. Also
 * runnable locally for fast feedback without round-tripping through CI.
 *
 * Input:
 *   lint-report.json  — written by `npm run lint -- --format json --output-file <path>`
 *
 * Output:
 *   lint-report.md    — section-headed Markdown with totals, by-rule table,
 *                       and per-file issue listings.
 *
 * Usage:
 *   node scripts/build-lint-report.mjs
 *     (defaults: input=lint-report.json, output=lint-report.md)
 *
 *   node scripts/build-lint-report.mjs --in path/in.json --out path/out.md
 *   node scripts/build-lint-report.mjs --help
 *
 * Exit codes:
 *   0 — report written successfully (regardless of issue count).
 *   1 — input missing or invalid JSON, or write failure.
 *
 * Pure helpers (`buildReport`) are exported for tests.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve, relative } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

export function buildReport(eslintResults, { generatedAt = new Date().toISOString(), cwd = rootDir } = {}) {
  let errors = 0;
  let warnings = 0;
  const byRule = {};
  let body = '';

  for (const file of eslintResults) {
    if (!file.messages || file.messages.length === 0) continue;
    const rel = relative(cwd, file.filePath).replace(/\\/g, '/');
    body += `## ${rel}\n\n`;
    for (const m of file.messages) {
      const sev = m.severity === 2 ? 'ERROR' : 'WARN';
      if (m.severity === 2) errors++; else warnings++;
      const rule = m.ruleId || 'unknown';
      byRule[rule] = (byRule[rule] || 0) + 1;
      body += `- [${sev}] L${m.line}:${m.column} — ${m.message} \`(${rule})\`\n`;
    }
    body += '\n';
  }

  const total = errors + warnings;
  let header = '# ESLint Lint Report\n\n';
  header += `Generated: ${generatedAt}\n`;
  header += 'Scope: `src`\n\n';
  header += `**Total: ${total} issues — ${errors} errors, ${warnings} warnings**\n\n`;

  const sorted = Object.entries(byRule).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    header += '## Issues by Rule\n\n';
    header += '| Rule | Count |\n|------|-------|\n';
    for (const [rule, count] of sorted) {
      header += `| \`${rule}\` | ${count} |\n`;
    }
    header += '\n---\n\n## Issues by File\n\n';
  } else {
    header += '_No lint issues. Clean run._\n';
  }

  return header + body;
}

function parseArgs(argv) {
  const out = { in: 'lint-report.json', out: 'lint-report.md', help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '--in') out.in = argv[++i];
    else if (a === '--out') out.out = argv[++i];
  }
  return out;
}

const invokedAsMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsMain) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`Usage: node scripts/build-lint-report.mjs [--in <path>] [--out <path>]

Defaults:
  --in   lint-report.json
  --out  lint-report.md

Convert ESLint JSON output into a Markdown digest grouped by rule and file.`);
    process.exit(0);
  }

  const inPath = resolve(rootDir, args.in);
  const outPath = resolve(rootDir, args.out);

  if (!existsSync(inPath)) {
    console.error(`[build-lint-report] ERROR: input not found: ${inPath}`);
    console.error('[build-lint-report] hint: run "npm run lint -- --format json --output-file lint-report.json" first.');
    process.exit(1);
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(inPath, 'utf-8'));
  } catch (err) {
    console.error(`[build-lint-report] ERROR: ${inPath} is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(raw)) {
    console.error('[build-lint-report] ERROR: input JSON must be an ESLint results array.');
    process.exit(1);
  }

  const md = buildReport(raw);

  try {
    writeFileSync(outPath, md, 'utf-8');
  } catch (err) {
    console.error(`[build-lint-report] ERROR: failed to write ${outPath}: ${err.message}`);
    process.exit(1);
  }

  const errorCount = raw.reduce((s, f) => s + (f.errorCount || 0), 0);
  const warningCount = raw.reduce((s, f) => s + (f.warningCount || 0), 0);
  console.log(`[build-lint-report] wrote ${outPath} — ${errorCount + warningCount} issues (${errorCount} errors, ${warningCount} warnings)`);
  process.exit(0);
}
