const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mapNode, isFresh, inClauseParams, repoCutoff } = require('./githubSync');

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

// --- C1: per-repo sync cutoff -------------------------------------------

test('repoCutoff: a repo that has never synced falls back to the days-back window, not the global cutoff', () => {
  const settings = { last_sync_at: '2026-08-17T09:00:00Z', sync_days_back: 30 };
  const neverSyncedRepo = { last_sync_at: null };
  const expectedFallback = repoCutoff(neverSyncedRepo, settings);
  // Must NOT be the global settings.last_sync_at (that was the bug: a
  // newly added repo inherited the global cutoff and synced nothing).
  assert.notEqual(expectedFallback, settings.last_sync_at);
  // Must be derived from sync_days_back, i.e. roughly 30 days ago.
  const ageMs = Date.now() - new Date(expectedFallback).getTime();
  const thirtyDaysMs = 30 * 86400000;
  assert.ok(
    Math.abs(ageMs - thirtyDaysMs) < 5000,
    'fallback cutoff should be ~sync_days_back days ago'
  );
});

test('repoCutoff: a repo with its own last_sync_at uses that, not the global settings.last_sync_at', () => {
  const settings = { last_sync_at: '2026-08-17T09:00:00Z', sync_days_back: 180 };
  const repo = { last_sync_at: '2026-01-01T00:00:00Z' };
  assert.equal(repoCutoff(repo, settings), '2026-01-01T00:00:00Z');
  assert.notEqual(repoCutoff(repo, settings), settings.last_sync_at);
});

test('repoCutoff: defaults to 180 days back when sync_days_back is not set', () => {
  const settings = { last_sync_at: null, sync_days_back: null };
  const neverSyncedRepo = { last_sync_at: null };
  const cutoff = repoCutoff(neverSyncedRepo, settings);
  const ageMs = Date.now() - new Date(cutoff).getTime();
  const oneEightyDaysMs = 180 * 86400000;
  assert.ok(Math.abs(ageMs - oneEightyDaysMs) < 5000);
});

// --- C1-adjacent: pin the strftime timestamp format in the UPDATE SQL ---

test('syncAll SQL: github_repos.last_sync_at is written with the ISO-8601 Z-suffixed strftime format, not datetime(\'now\')', () => {
  const src = fs.readFileSync(path.join(__dirname, 'githubSync.js'), 'utf8');
  assert.match(
    src,
    /UPDATE github_repos SET last_sync_at = strftime\('%Y-%m-%dT%H:%M:%SZ','now'\), last_sync_error = NULL WHERE id = \?/,
    "github_repos.last_sync_at must use strftime('%Y-%m-%dT%H:%M:%SZ','now') — reverting to datetime('now') silently reintroduces the same-day over-sync bug"
  );
});

test('syncAll SQL: github_settings.last_sync_at is written with the ISO-8601 Z-suffixed strftime format, not datetime(\'now\')', () => {
  const src = fs.readFileSync(path.join(__dirname, 'githubSync.js'), 'utf8');
  assert.match(
    src,
    /UPDATE github_settings SET last_sync_at = strftime\('%Y-%m-%dT%H:%M:%SZ','now'\), updated_at = datetime\('now'\) WHERE id = 'default'/,
    "github_settings.last_sync_at must use strftime('%Y-%m-%dT%H:%M:%SZ','now')"
  );
});

test('syncAll SQL: repoCutoff is called per-repo inside the loop, not hoisted above it', () => {
  // Pins the call SITE of repoCutoff, not just its return-value semantics
  // (already covered by the repoCutoff tests above). Hoisting
  // `const cutoff = repoCutoff(repo, settings)` out above `for (const repo
  // of repos)` would reintroduce the Critical bug in full — one global
  // cutoff shared by every repo — while every existing test, including the
  // repoCutoff unit tests, would still pass.
  const src = fs.readFileSync(path.join(__dirname, 'githubSync.js'), 'utf8');
  const funcMatch = src.match(/async function syncAll\(\)\s*{[\s\S]*?\n}\n/);
  assert.ok(funcMatch, 'syncAll function body not found in githubSync.js');
  const body = funcMatch[0];

  const loopIdx = body.indexOf('for (const repo of repos)');
  const cutoffIdx = body.indexOf('repoCutoff(repo, settings)');
  assert.ok(loopIdx !== -1, 'per-repo loop `for (const repo of repos)` not found');
  assert.ok(cutoffIdx !== -1, 'repoCutoff(repo, settings) call not found');
  assert.ok(
    cutoffIdx > loopIdx,
    'repoCutoff(repo, settings) must be called inside the per-repo loop body, ' +
      'not hoisted above `for (const repo of repos)` — hoisting it computes one ' +
      'shared cutoff for every repo again'
  );
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
