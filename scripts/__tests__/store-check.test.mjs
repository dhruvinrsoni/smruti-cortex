// ──────────────────────────────────────────────────────────────────────────────
// Unit tests for scripts/store-check.mjs (pure permission-audit helpers)
// ──────────────────────────────────────────────────────────────────────────────
// Run with:   node --test scripts/__tests__/store-check.test.mjs
//
// These tests exercise the exported pure helpers — they don't touch disk,
// don't fork git, don't fetch the public Chrome Web Store. The CLI body in
// store-check.mjs is gated behind an `invokedAsMain` check so importing the
// module here does NOT run the checks or call process.exit.
// ──────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseManifestPermissions,
  parseDocPermissions,
  auditPermissions,
} from '../store-check.mjs';

// ──────────────────────────────────────────────────────────────────────────────
// parseManifestPermissions
// ──────────────────────────────────────────────────────────────────────────────

test('parseManifestPermissions: returns required + optional in declaration order', () => {
  const manifest = {
    permissions: ['history', 'storage', 'idle'],
    optional_permissions: ['tabGroups', 'topSites'],
  };
  const result = parseManifestPermissions(manifest);
  assert.deepEqual(result, {
    required: ['history', 'storage', 'idle'],
    optional: ['tabGroups', 'topSites'],
  });
});

test('parseManifestPermissions: normalises missing arrays to []', () => {
  assert.deepEqual(parseManifestPermissions({}), { required: [], optional: [] });
  assert.deepEqual(parseManifestPermissions({ permissions: ['a'] }), { required: ['a'], optional: [] });
  assert.deepEqual(parseManifestPermissions({ optional_permissions: ['b'] }), { required: [], optional: ['b'] });
  assert.deepEqual(parseManifestPermissions(null), { required: [], optional: [] });
});

// ──────────────────────────────────────────────────────────────────────────────
// parseDocPermissions
// ──────────────────────────────────────────────────────────────────────────────

test('parseDocPermissions: extracts headings under Required / Optional sections', () => {
  const doc = `
## 4. Permissions

### Required Permissions

#### \`history\`
text.

#### \`storage\`
text.

### Optional Permissions

#### \`tabGroups\`
text.
`;
  assert.deepEqual(parseDocPermissions(doc), {
    required: ['history', 'storage'],
    optional: ['tabGroups'],
  });
});

test('parseDocPermissions: handles "*(new in vX.Y.Z)*" suffix on heading', () => {
  const doc = `
### Required Permissions

#### \`alarms\`
existing.

#### \`idle\` *(new in v9.2.0)*
new in this release.
`;
  const result = parseDocPermissions(doc);
  assert.deepEqual(result.required, ['alarms', 'idle']);
});

test('parseDocPermissions: ignores headings outside permission subsections', () => {
  const doc = `
## 4. Permissions

### Required Permissions

#### \`history\`

### Optional Host Permissions

#### \`<all_urls>\`

## 5. Remote Code

#### \`bogus\`
`;
  // <all_urls> lives under Optional Host Permissions (separately audited),
  // and #### bogus is under section 5 — neither should leak into either bucket.
  assert.deepEqual(parseDocPermissions(doc), {
    required: ['history'],
    optional: [],
  });
});

test('parseDocPermissions: stops a subsection at --- divider', () => {
  const doc = `
### Required Permissions

#### \`history\`

---

#### \`leaked\`
`;
  assert.deepEqual(parseDocPermissions(doc).required, ['history']);
});

// ──────────────────────────────────────────────────────────────────────────────
// auditPermissions — the v9.2.0 idle regression class
// ──────────────────────────────────────────────────────────────────────────────

test('auditPermissions: empty array when manifest and doc are in sync', () => {
  const manifest = { required: ['history', 'storage'], optional: ['tabGroups'] };
  const doc = { required: ['history', 'storage'], optional: ['tabGroups'] };
  assert.deepEqual(auditPermissions(manifest, doc), []);
});

test('auditPermissions: detects missing-required-justification (the `idle` regression)', () => {
  // Mirrors what would have happened in v9.2.0 before the fix: idle declared
  // in the manifest, but no Section 4 entry in the scaffolded doc.
  const manifest = { required: ['history', 'idle'], optional: [] };
  const doc =      { required: ['history'],         optional: [] };
  const issues = auditPermissions(manifest, doc);
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0], { kind: 'missing-required-justification', perm: 'idle' });
});

test('auditPermissions: detects missing-optional-justification', () => {
  const manifest = { required: [], optional: ['topSites', 'tabGroups'] };
  const doc =      { required: [], optional: ['topSites'] };
  const issues = auditPermissions(manifest, doc);
  assert.deepEqual(issues, [{ kind: 'missing-optional-justification', perm: 'tabGroups' }]);
});

test('auditPermissions: detects stale justifications (perm removed from manifest)', () => {
  // A permission was once needed, the doc still has its #### entry, but the
  // manifest no longer declares it. Reviewers won't ding us for over-explaining,
  // but it's drift worth flagging so the doc matches the package being uploaded.
  const manifest = { required: ['history'],          optional: [] };
  const doc =      { required: ['history', 'tabs'], optional: ['gone'] };
  const issues = auditPermissions(manifest, doc);
  assert.deepEqual(issues, [
    { kind: 'stale-required-justification', perm: 'tabs' },
    { kind: 'stale-optional-justification', perm: 'gone' },
  ]);
});

test('auditPermissions: missing issues come before stale issues', () => {
  // Ordering matters for human readability of the check output.
  const manifest = { required: ['idle'],     optional: [] };
  const doc =      { required: ['old-perm'], optional: [] };
  const issues = auditPermissions(manifest, doc);
  assert.equal(issues[0].kind, 'missing-required-justification');
  assert.equal(issues[1].kind, 'stale-required-justification');
});
