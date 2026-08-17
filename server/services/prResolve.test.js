const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJiraKey, resolveSprint, firstReviewAt } = require('./prResolve');

test('parseJiraKey prefers the title over the branch', () => {
  assert.equal(parseJiraKey('PAY-118 add refund webhook', 'feature/OPS-1-x'), 'PAY-118');
});

test('parseJiraKey falls back to the branch', () => {
  assert.equal(parseJiraKey('add refund webhook', 'feature/OPS-64-cache'), 'OPS-64');
});

test('parseJiraKey returns null when neither has a key', () => {
  assert.equal(parseJiraKey('bump deps', 'chore/bump-deps'), null);
});

test('parseJiraKey ignores lowercase and bare numbers', () => {
  assert.equal(parseJiraKey('fix pay-118 and issue 42', 'main'), null);
});

test('parseJiraKey handles alphanumeric project keys', () => {
  assert.equal(parseJiraKey('A1B-7 tweak', 'main'), 'A1B-7');
});

test('parseJiraKey tolerates null inputs', () => {
  assert.equal(parseJiraKey(null, null), null);
});

const PLANS = [
  { jira_sprint_name: 'Sprint 23', start_date: '2026-07-01', end_date: '2026-07-14' },
  { jira_sprint_name: 'Sprint 24', start_date: '2026-07-15', end_date: '2026-07-28' },
];

test('resolveSprint prefers the story sprint', () => {
  const r = resolveSprint({
    story: { sprint: 'Sprint 24' }, plans: PLANS,
    mergedAt: '2026-07-02T00:00:00Z', createdAt: '2026-07-01T00:00:00Z',
  });
  assert.deepEqual(r, { sprint: 'Sprint 24', source: 'story' });
});

test('resolveSprint falls back to the merge-date window', () => {
  const r = resolveSprint({
    story: null, plans: PLANS,
    mergedAt: '2026-07-20T09:00:00Z', createdAt: '2026-07-02T00:00:00Z',
  });
  assert.deepEqual(r, { sprint: 'Sprint 24', source: 'date_window' });
});

test('resolveSprint uses the created date for open PRs', () => {
  const r = resolveSprint({
    story: null, plans: PLANS, mergedAt: null, createdAt: '2026-07-03T00:00:00Z',
  });
  assert.deepEqual(r, { sprint: 'Sprint 23', source: 'date_window' });
});

test('resolveSprint returns none when no window matches', () => {
  const r = resolveSprint({
    story: null, plans: PLANS, mergedAt: null, createdAt: '2026-01-01T00:00:00Z',
  });
  assert.deepEqual(r, { sprint: null, source: 'none' });
});

test('resolveSprint picks the later start_date when windows overlap', () => {
  const overlapping = [
    { jira_sprint_name: 'Old', start_date: '2026-07-01', end_date: '2026-07-31' },
    { jira_sprint_name: 'New', start_date: '2026-07-15', end_date: '2026-07-28' },
  ];
  const r = resolveSprint({
    story: null, plans: overlapping, mergedAt: '2026-07-20T00:00:00Z', createdAt: null,
  });
  assert.equal(r.sprint, 'New');
});

test('resolveSprint ignores a story with an empty sprint', () => {
  const r = resolveSprint({
    story: { sprint: null }, plans: PLANS,
    mergedAt: '2026-07-20T00:00:00Z', createdAt: null,
  });
  assert.deepEqual(r, { sprint: 'Sprint 24', source: 'date_window' });
});

test('resolveSprint skips plans with no sprint name', () => {
  const unnamed = [{ jira_sprint_name: null, start_date: '2026-07-15', end_date: '2026-07-28' }];
  const r = resolveSprint({
    story: null, plans: unnamed, mergedAt: '2026-07-20T00:00:00Z', createdAt: null,
  });
  assert.deepEqual(r, { sprint: null, source: 'none' });
});

test('firstReviewAt returns the earliest non-author review', () => {
  const reviews = [
    { author_login: 'ahmed', submitted_at: '2026-07-20T12:00:00Z' },
    { author_login: 'sara', submitted_at: '2026-07-19T09:00:00Z' },
  ];
  assert.equal(firstReviewAt(reviews, 'ahmed'), '2026-07-19T09:00:00Z');
});

test('firstReviewAt ignores self-reviews entirely', () => {
  const reviews = [{ author_login: 'ahmed', submitted_at: '2026-07-19T09:00:00Z' }];
  assert.equal(firstReviewAt(reviews, 'ahmed'), null);
});

test('firstReviewAt returns null for no reviews', () => {
  assert.equal(firstReviewAt([], 'ahmed'), null);
});
