const test = require('node:test');
const assert = require('node:assert/strict');
const { mapNode, isFresh, inClauseParams } = require('./githubSync');

// --- Finding 1: timestamp-format contract -----------------------------

test('isFresh: ISO-8601 UTC cutoff vs GitHub ISO-8601 UTC updatedAt compares correctly same-day', () => {
  // Fixed format: both sides are 'YYYY-MM-DDTHH:MM:SSZ'.
  const cutoff = '2026-08-17T09:00:00Z';
  // Updated earlier the same day -> should NOT be fresh.
  assert.equal(isFresh('2026-08-17T08:00:00Z', cutoff), false);
  // Updated later the same day -> should be fresh.
  assert.equal(isFresh('2026-08-17T10:00:00Z', cutoff), true);
  // Updated on a later day -> fresh.
  assert.equal(isFresh('2026-08-18T00:00:00Z', cutoff), true);
  // Updated on an earlier day -> not fresh.
  assert.equal(isFresh('2026-08-16T23:59:59Z', cutoff), false);
});

test('isFresh: regression - the old datetime(\'now\') space-separated cutoff format is broken', () => {
  // This is the buggy format SQLite's datetime('now') produces:
  // 'YYYY-MM-DD HH:MM:SS' (space separator, no Z). It must never be used
  // again for github_settings.last_sync_at / github_repos.last_sync_at.
  const buggyCutoff = '2026-08-17 09:00:00';
  // A PR updated an hour BEFORE the cutoff, same calendar day, should not
  // be fresh -- but under the old format it lexically compares as fresh
  // because 'T' (0x54) sorts after ' ' (0x20) at the first differing byte.
  const updatedAtBeforeCutoff = '2026-08-17T08:00:00Z';
  assert.equal(
    isFresh(updatedAtBeforeCutoff, buggyCutoff),
    true,
    'demonstrates the bug: this SHOULD be false but the broken format makes it true'
  );
});

test('isFresh: correct ISO-8601 cutoff format fixes the same-day regression case above', () => {
  const fixedCutoff = '2026-08-17T09:00:00Z';
  const updatedAtBeforeCutoff = '2026-08-17T08:00:00Z';
  assert.equal(isFresh(updatedAtBeforeCutoff, fixedCutoff), false);
});

// --- Finding 3: N+1 story lookup / storyMap plumbing -------------------

test('inClauseParams: dedupes keys and never interpolates values into the SQL text', () => {
  const { placeholders, params } = inClauseParams(['PAY-1', 'OPS-2', 'PAY-1', null, undefined]);
  assert.equal(placeholders, '?,?');
  assert.deepEqual(params, ['PAY-1', 'OPS-2']);
});

test('inClauseParams: empty input yields no placeholders and no params', () => {
  const { placeholders, params } = inClauseParams([]);
  assert.equal(placeholders, '');
  assert.deepEqual(params, []);
});

function baseNode(overrides) {
  return Object.assign(
    {
      number: 1,
      title: 'PAY-999 test',
      url: 'u',
      state: 'MERGED',
      isDraft: false,
      createdAt: '2026-07-01T00:00:00Z',
      mergedAt: '2026-07-02T00:00:00Z',
      closedAt: null,
      updatedAt: '2026-07-02T00:00:00Z',
      additions: 5,
      deletions: 1,
      changedFiles: 2,
      author: { login: 'someone' },
      baseRefName: 'main',
      headRefName: 'f/x',
      reviews: { nodes: [] },
    },
    overrides
  );
}

test('mapNode: resolves story_id/sprint from the passed-in storyMap, not a per-call db lookup', () => {
  const storyMap = new Map([['PAY-999', { id: 42, sprint: 'Sprint 7' }]]);
  const out = mapNode(baseNode(), {
    repoId: 1,
    plans: [],
    memberMap: new Map(),
    knownPrefixes: null,
    storyMap,
  });
  assert.equal(out.row.jira_key, 'PAY-999');
  assert.equal(out.row.story_id, 42);
  assert.equal(out.row.sprint, 'Sprint 7');
  assert.equal(out.row.sprint_source, 'story');
});

test('mapNode: a jira key with no entry in storyMap behaves the same as no match found', () => {
  const out = mapNode(baseNode(), {
    repoId: 1,
    plans: [],
    memberMap: new Map(),
    knownPrefixes: null,
    storyMap: new Map(), // PAY-999 not present
  });
  assert.equal(out.row.jira_key, 'PAY-999');
  assert.equal(out.row.story_id, null);
  assert.equal(out.row.sprint_source, 'none');
});

test('mapNode: missing storyMap argument defaults to no match (backward compatible)', () => {
  const out = mapNode(baseNode(), {
    repoId: 1,
    plans: [],
    memberMap: new Map(),
  });
  assert.equal(out.row.story_id, null);
});
