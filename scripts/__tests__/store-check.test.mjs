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
  computePermissionDelta,
  classifySubmittedDate,
} from '../store-check.mjs';

// ──────────────────────────────────────────────────────────────────────────────
// parseManifestPermissions
// ──────────────────────────────────────────────────────────────────────────────

test('parseManifestPermissions: returns all four permission arrays in declaration order', () => {
  const manifest = {
    permissions: ['history', 'storage', 'idle'],
    optional_permissions: ['tabGroups', 'topSites'],
    host_permissions: ['https://example.com/*'],
    optional_host_permissions: ['<all_urls>'],
  };
  const result = parseManifestPermissions(manifest);
  assert.deepEqual(result, {
    required: ['history', 'storage', 'idle'],
    optional: ['tabGroups', 'topSites'],
    hostRequired: ['https://example.com/*'],
    hostOptional: ['<all_urls>'],
  });
});

test('parseManifestPermissions: normalises missing arrays to []', () => {
  assert.deepEqual(parseManifestPermissions({}), {
    required: [], optional: [], hostRequired: [], hostOptional: [],
  });
  assert.deepEqual(parseManifestPermissions({ permissions: ['a'] }), {
    required: ['a'], optional: [], hostRequired: [], hostOptional: [],
  });
  assert.deepEqual(parseManifestPermissions({ optional_permissions: ['b'] }), {
    required: [], optional: ['b'], hostRequired: [], hostOptional: [],
  });
  assert.deepEqual(parseManifestPermissions({ optional_host_permissions: ['<all_urls>'] }), {
    required: [], optional: [], hostRequired: [], hostOptional: ['<all_urls>'],
  });
  assert.deepEqual(parseManifestPermissions(null), {
    required: [], optional: [], hostRequired: [], hostOptional: [],
  });
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
    hostRequired: [],
    hostOptional: [],
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

test('parseDocPermissions: routes the four documented Section-4 subsections correctly', () => {
  const doc = `
## 4. Permissions

### Required Permissions

#### \`history\`

### Optional Permissions

#### \`tabGroups\`

### Required Host Permissions

#### \`https://example.com/*\`

### Optional Host Permissions

#### \`<all_urls>\`

## 5. Remote Code

#### \`bogus\`
`;
  // #### bogus is under section 5 — must not leak into any bucket.
  assert.deepEqual(parseDocPermissions(doc), {
    required: ['history'],
    optional: ['tabGroups'],
    hostRequired: ['https://example.com/*'],
    hostOptional: ['<all_urls>'],
  });
});

test('parseDocPermissions: "Optional Host Permissions" is matched before "Optional Permissions" prefix', () => {
  // Regression: an earlier draft routed "### Optional Host Permissions" to
  // the optional bucket because the regex order was wrong.
  const doc = `
### Optional Permissions

#### \`tabGroups\`

### Optional Host Permissions

#### \`<all_urls>\`
`;
  const r = parseDocPermissions(doc);
  assert.deepEqual(r.optional, ['tabGroups']);
  assert.deepEqual(r.hostOptional, ['<all_urls>']);
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

test('auditPermissions: detects missing-host-justification (S7)', () => {
  // Manifest declares <all_urls> as optional_host_permissions; doc forgot the
  // matching #### block under "### Optional Host Permissions".
  const manifest = { required: [], optional: [], hostRequired: [], hostOptional: ['<all_urls>'] };
  const doc =      { required: [], optional: [], hostRequired: [], hostOptional: [] };
  const issues = auditPermissions(manifest, doc);
  assert.deepEqual(issues, [{ kind: 'missing-host-justification', perm: '<all_urls>' }]);
});

test('auditPermissions: detects stale-host-justification (S7)', () => {
  // Doc still has a #### block for a host that was removed from the manifest.
  const manifest = { required: [], optional: [], hostRequired: [], hostOptional: [] };
  const doc =      { required: [], optional: [], hostRequired: [], hostOptional: ['<all_urls>'] };
  const issues = auditPermissions(manifest, doc);
  assert.deepEqual(issues, [{ kind: 'stale-host-justification', perm: '<all_urls>' }]);
});

test('auditPermissions: tolerates legacy callers passing only required/optional (S7)', () => {
  // Defensive: callers who haven't been updated to populate hostRequired/
  // hostOptional should still get a sensible audit on the regular perms.
  const manifest = { required: ['idle'], optional: [] };
  const doc      = { required: [],       optional: [] };
  const issues = auditPermissions(manifest, doc);
  assert.deepEqual(issues, [{ kind: 'missing-required-justification', perm: 'idle' }]);
});

// ──────────────────────────────────────────────────────────────────────────────
// computePermissionDelta — drives the --init scaffolder banner
// ──────────────────────────────────────────────────────────────────────────────

// All-empty delta shape used as a baseline by several tests below.
const EMPTY_DELTA = {
  requiredAdded: [], requiredRemoved: [], optionalAdded: [], optionalRemoved: [],
  hostRequiredAdded: [], hostRequiredRemoved: [], hostOptionalAdded: [], hostOptionalRemoved: [],
};

test('computePermissionDelta: empty delta when manifests match', () => {
  const prev = { permissions: ['history', 'storage'], optional_permissions: ['tabGroups'] };
  const cur  = { permissions: ['history', 'storage'], optional_permissions: ['tabGroups'] };
  assert.deepEqual(computePermissionDelta(prev, cur), EMPTY_DELTA);
});

test('computePermissionDelta: detects v9.1.0 -> v9.2.0 idle addition', () => {
  // Reproduces the exact diff that should have triggered a banner during the
  // v9.2.0 scaffold — and didn't, because the helper didn't exist yet.
  const prev = {
    permissions: ['history', 'bookmarks', 'storage', 'tabs', 'alarms', 'scripting', 'activeTab', 'sessions', 'windows'],
    optional_permissions: ['tabGroups', 'browsingData', 'topSites'],
  };
  const cur = {
    permissions: ['history', 'bookmarks', 'storage', 'tabs', 'alarms', 'scripting', 'activeTab', 'sessions', 'windows', 'idle'],
    optional_permissions: ['tabGroups', 'browsingData', 'topSites'],
  };
  const delta = computePermissionDelta(prev, cur);
  assert.deepEqual(delta.requiredAdded, ['idle']);
  assert.deepEqual(delta.requiredRemoved, []);
  assert.deepEqual(delta.optionalAdded, []);
  assert.deepEqual(delta.optionalRemoved, []);
});

test('computePermissionDelta: detects removals and optional-side changes simultaneously', () => {
  const prev = { permissions: ['history', 'tabs'],    optional_permissions: ['topSites'] };
  const cur  = { permissions: ['history'],            optional_permissions: ['tabGroups', 'browsingData'] };
  assert.deepEqual(computePermissionDelta(prev, cur), {
    ...EMPTY_DELTA,
    requiredRemoved: ['tabs'],
    optionalAdded: ['tabGroups', 'browsingData'],
    optionalRemoved: ['topSites'],
  });
});

test('computePermissionDelta: detects host-permission additions and removals (S7)', () => {
  const prev = {
    permissions: ['history'],
    host_permissions: ['https://old.example.com/*'],
    optional_host_permissions: [],
  };
  const cur = {
    permissions: ['history'],
    host_permissions: ['https://new.example.com/*'],
    optional_host_permissions: ['<all_urls>'],
  };
  const delta = computePermissionDelta(prev, cur);
  assert.deepEqual(delta.hostRequiredAdded, ['https://new.example.com/*']);
  assert.deepEqual(delta.hostRequiredRemoved, ['https://old.example.com/*']);
  assert.deepEqual(delta.hostOptionalAdded, ['<all_urls>']);
  assert.deepEqual(delta.hostOptionalRemoved, []);
});

test('computePermissionDelta: handles null/undefined manifests gracefully', () => {
  // Defensive: prev manifest read can fail (corrupt git, deleted tag, etc.).
  // The scaffolder catches the throw, but the helper itself shouldn't crash
  // on an empty argument either.
  assert.deepEqual(computePermissionDelta(null, { permissions: ['idle'] }), {
    ...EMPTY_DELTA,
    requiredAdded: ['idle'],
  });
  assert.deepEqual(computePermissionDelta({}, {}), EMPTY_DELTA);
});

// ──────────────────────────────────────────────────────────────────────────────
// classifySubmittedDate (S6)
// ──────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-04-29T00:00:00Z');

test('classifySubmittedDate: same-day ISO date passes', () => {
  const r = classifySubmittedDate('2026-04-29', NOW);
  assert.equal(r.status, 'pass');
  assert.equal(r.ageDays, 0);
});

test('classifySubmittedDate: yesterday ISO date passes (1 day old)', () => {
  const r = classifySubmittedDate('2026-04-28', NOW);
  assert.equal(r.status, 'pass');
  assert.equal(r.ageDays, 1);
});

test('classifySubmittedDate: future date fails with day-count', () => {
  const r = classifySubmittedDate('2026-05-01', NOW);
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /2 day\(s\) in the future/);
});

test('classifySubmittedDate: 365 days old still passes (boundary)', () => {
  const r = classifySubmittedDate('2025-04-29', NOW);
  assert.equal(r.status, 'pass');
  assert.equal(r.ageDays, 365);
});

test('classifySubmittedDate: 366 days old warns (just past the boundary)', () => {
  const r = classifySubmittedDate('2025-04-28', NOW);
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /366 days old/);
});

test('classifySubmittedDate: very old date warns', () => {
  const r = classifySubmittedDate('2020-01-01', NOW);
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /\d+ days old/);
});

test('classifySubmittedDate: verbose date format ("April 24, 2026") parses', () => {
  const r = classifySubmittedDate('April 24, 2026', NOW);
  assert.equal(r.status, 'pass');
  assert.equal(r.ageDays, 5);
});

test('classifySubmittedDate: empty or whitespace-only returns fail', () => {
  assert.equal(classifySubmittedDate('', NOW).status, 'fail');
  assert.equal(classifySubmittedDate('   ', NOW).status, 'fail');
});

test('classifySubmittedDate: garbage strings return fail with "unparseable"', () => {
  const r = classifySubmittedDate('not a date', NOW);
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /unparseable/);
});

test('classifySubmittedDate: non-string inputs return fail without throwing', () => {
  assert.equal(classifySubmittedDate(undefined, NOW).status, 'fail');
  assert.equal(classifySubmittedDate(null, NOW).status, 'fail');
  assert.equal(classifySubmittedDate(42, NOW).status, 'fail');
});
