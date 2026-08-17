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
