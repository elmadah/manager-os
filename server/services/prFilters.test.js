const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPrFilter } = require('./prFilters');

test('no filters produces a neutral clause', () => {
  const { where, params } = buildPrFilter({});
  assert.equal(where, 'WHERE 1=1');
  assert.deepEqual(params, []);
});

test('no filters produces an empty clauses array', () => {
  const { clauses } = buildPrFilter({});
  assert.deepEqual(clauses, []);
});

test('single sprint scope filters on sprint and is single', () => {
  const { where, params, scope } = buildPrFilter({ scope: 'sprint', sprint: 'Sprint 24' });
  assert.match(where, /pr\.sprint IN \(\?\)/);
  assert.deepEqual(params, ['Sprint 24']);
  assert.equal(scope.isSingle, true);
});

test('multiple sprints are not single scope', () => {
  const { where, params, scope } = buildPrFilter({
    scope: 'sprint', sprint: ['Sprint 23', 'Sprint 24'],
  });
  assert.match(where, /pr\.sprint IN \(\?, \?\)/);
  assert.deepEqual(params, ['Sprint 23', 'Sprint 24']);
  assert.equal(scope.isSingle, false);
});

test('release scope joins through stories and is single', () => {
  const { where, params, scope } = buildPrFilter({ scope: 'release', release: '2026-09-01' });
  assert.match(where, /stories/);
  assert.deepEqual(params, ['2026-09-01']);
  assert.equal(scope.isSingle, true);
});

test('range scope filters on the effective date', () => {
  const { where, params, scope } = buildPrFilter({
    scope: 'range', from: '2026-07-01', to: '2026-07-31',
  });
  assert.match(where, /COALESCE\(pr\.merged_at, pr\.pr_created_at\)/);
  assert.deepEqual(params, ['2026-07-01', '2026-07-31']);
  assert.equal(scope.isSingle, false);
});

test('all scope adds no date clause', () => {
  const { where, params, scope } = buildPrFilter({ scope: 'all' });
  assert.equal(where, 'WHERE 1=1');
  assert.deepEqual(params, []);
  assert.equal(scope.isSingle, false);
});

test('repo, author, state and project filters combine', () => {
  const { where, params, clauses } = buildPrFilter({
    repo: ['3'], author: ['7'], state: 'open', project: '2',
  });
  assert.match(where, /pr\.repo_id IN \(\?\)/);
  assert.match(where, /pr\.author_member_id IN \(\?\)/);
  assert.match(where, /pr\.state = \?/);
  assert.match(where, /r\.project_id = \?/);
  assert.deepEqual(params, [3, 7, 'open', 2]);
  // clauses stays consistent with where for a multi-filter case
  assert.equal(clauses.length, 4);
  assert.equal(where, `WHERE ${clauses.join(' AND ')}`);
});

test('reviewer filter uses an EXISTS subquery', () => {
  const { where, params } = buildPrFilter({ reviewer: '5' });
  assert.match(where, /EXISTS \(SELECT 1 FROM pr_reviews/);
  assert.deepEqual(params, [5]);
});

test('an invalid state is ignored rather than injected', () => {
  const { where, params } = buildPrFilter({ state: "open'; DROP TABLE pull_requests--" });
  assert.equal(where, 'WHERE 1=1');
  assert.deepEqual(params, []);
});

test('non-numeric repo ids are dropped', () => {
  const { where, params } = buildPrFilter({ repo: ['abc'] });
  assert.equal(where, 'WHERE 1=1');
  assert.deepEqual(params, []);
});

test('an unknown scope falls back to all', () => {
  const { scope } = buildPrFilter({ scope: 'nonsense' });
  assert.equal(scope.mode, 'all');
});

function assertOnlyPrimitives(params) {
  for (const p of params) {
    assert.ok(
      p === null || ['string', 'number', 'boolean'].includes(typeof p),
      `expected primitive param, got ${JSON.stringify(p)}`
    );
  }
}

test('repeated from param (array) applies no range clause and binds no params', () => {
  const { where, params, clauses } = buildPrFilter({
    scope: 'range', from: ['2026-07-01', '2026-07-31'], to: '2026-08-01',
  });
  assert.equal(where, 'WHERE 1=1');
  assert.deepEqual(clauses, []);
  assert.deepEqual(params, []);
  assertOnlyPrimitives(params);
});

test('repeated release param (array) applies no release clause', () => {
  const { where, params, clauses } = buildPrFilter({
    scope: 'release', release: ['a', 'b'],
  });
  assert.equal(where, 'WHERE 1=1');
  assert.deepEqual(clauses, []);
  assert.deepEqual(params, []);
  assertOnlyPrimitives(params);
});

test('non-string entries in sprint array are dropped, valid strings survive', () => {
  const { where, params } = buildPrFilter({
    scope: 'sprint', sprint: ['Sprint 24', { evil: 1 }],
  });
  assert.match(where, /pr\.sprint IN \(\?\)/);
  assert.deepEqual(params, ['Sprint 24']);
  assertOnlyPrimitives(params);
});

test('a plain object arriving where a scalar is expected applies no clause', () => {
  const { where, params, clauses } = buildPrFilter({
    scope: 'range', from: { $ne: null }, to: '2026-08-01',
  });
  assert.equal(where, 'WHERE 1=1');
  assert.deepEqual(clauses, []);
  assert.deepEqual(params, []);
  assertOnlyPrimitives(params);
});

// --- prClauses / repoClauses split -----------------------------------------

test('a project filter lands in the repo-level group and not the PR-level group', () => {
  const { repoClauses, prClauses, repoParams, prParams } = buildPrFilter({ project: '2' });
  assert.equal(repoClauses.length, 1);
  assert.match(repoClauses[0], /r\.project_id = \?/);
  assert.deepEqual(repoParams, [2]);
  assert.deepEqual(prClauses, []);
  assert.deepEqual(prParams, []);
});

test('repo, author, state, scope and reviewer filters land in the PR-level group', () => {
  const { prClauses, repoClauses, prParams, repoParams } = buildPrFilter({
    scope: 'sprint', sprint: 'Sprint 24',
    repo: ['3'], author: ['7'], state: 'open', reviewer: '5',
  });
  // scope, repo, author, state, reviewer = 5 pr-level clauses
  assert.equal(prClauses.length, 5);
  assert.match(prClauses.join(' '), /pr\.sprint IN/);
  assert.match(prClauses.join(' '), /pr\.repo_id IN/);
  assert.match(prClauses.join(' '), /pr\.author_member_id IN/);
  assert.match(prClauses.join(' '), /pr\.state = \?/);
  assert.match(prClauses.join(' '), /EXISTS \(SELECT 1 FROM pr_reviews/);
  assert.deepEqual(prParams, ['Sprint 24', 3, 7, 'open', 5]);
  assert.deepEqual(repoClauses, []);
  assert.deepEqual(repoParams, []);
});

test('both groups are empty when nothing is filtered', () => {
  const { prClauses, repoClauses, prParams, repoParams } = buildPrFilter({});
  assert.deepEqual(prClauses, []);
  assert.deepEqual(repoClauses, []);
  assert.deepEqual(prParams, []);
  assert.deepEqual(repoParams, []);
});

test('combined clauses and params are unchanged from today\'s behavior for a multi-filter case', () => {
  const { where, params, clauses, prClauses, repoClauses } = buildPrFilter({
    repo: ['3'], author: ['7'], state: 'open', project: '2',
  });
  assert.match(where, /pr\.repo_id IN \(\?\)/);
  assert.match(where, /pr\.author_member_id IN \(\?\)/);
  assert.match(where, /pr\.state = \?/);
  assert.match(where, /r\.project_id = \?/);
  assert.deepEqual(params, [3, 7, 'open', 2]);
  assert.equal(clauses.length, 4);
  assert.equal(where, `WHERE ${clauses.join(' AND ')}`);
  // and the split groups partition clauses exactly, in the same relative order
  assert.equal(prClauses.length + repoClauses.length, clauses.length);
  assert.deepEqual(prClauses, [
    'pr.repo_id IN (?)', 'pr.author_member_id IN (?)', 'pr.state = ?',
  ]);
  assert.deepEqual(repoClauses, ['r.project_id = ?']);
});
