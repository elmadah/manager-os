# PR Stats Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/pull-requests` dashboard that syncs GitHub PRs into local tables and reports sprint/release readiness, per-person contribution, and throughput trend across repositories.

**Architecture:** Mirror the existing Jira integration — configuration in a settings table, a GraphQL sync that pulls PRs into local SQLite tables, and a React page whose every read is a local SQL query. PRs are attributed to sprints by a Jira key parsed from the title or branch (joining `stories`), falling back to a merge-date match against `capacity_plans` windows.

**Tech Stack:** Node 22 + Express (CommonJS), sql.js via the `db.prepare().run/get/all()` wrapper in `server/db/init.js`, React 18 + React Router v7, Tailwind v4, Recharts, lucide-react. Tests use Node's built-in `node --test` runner — no new dependencies.

## Global Constraints

- **Source of truth is the spec:** `docs/superpowers/specs/2026-08-17-pr-stats-dashboard-design.md`. Read it before Task 1.
- **CommonJS on the server** (`require`/`module.exports`). ESM on the client.
- **All DB access goes through `server/db/init.js`** — `db.prepare(sql).run/get/all(...params)`, `db.transaction(fn)`. Never import sql.js directly.
- **Never interpolate user input into SQL.** Always bound parameters (`?`).
- **Schema changes go in two places:** `server/db/schema.sql` (`CREATE TABLE IF NOT EXISTS`) for new tables, and a `migrate(...)` call in `server/db/init.js` for new columns on existing tables.
- **No new npm dependencies.** Tests use `node:test` and `node:assert/strict`, both built in.
- **PR state enum is lowercase:** `open` | `merged` | `closed`.
- **`sprint_source` enum:** `story` | `date_window` | `none`.
- **Stale definition (exact, used everywhere):** an open, non-draft PR with `first_review_at IS NULL` and `pr_created_at` older than 3 days.
- **Tailwind classes only** for styling — no CSS files, matching the other pages.
- **Commit after every task.** Conventional commit prefixes (`feat:`, `test:`, `chore:`).

## File Structure

**Server — created:**
- `server/services/prResolve.js` — pure functions: Jira key parsing, sprint-window resolution, first-review calculation. No DB access.
- `server/services/prFilters.js` — pure function: query params → SQL `WHERE` fragment + bound params.
- `server/services/githubClient.js` — GraphQL transport. Knows HTTP, not business logic.
- `server/services/githubSync.js` — orchestrates: fetch → resolve → upsert. The only file that writes PR tables.
- `server/routes/githubSettings.js` — settings + repo CRUD + sync trigger.
- `server/routes/pullRequests.js` — the six read endpoints.
- `server/services/prResolve.test.js`, `server/services/prFilters.test.js` — colocated tests.

**Server — modified:**
- `server/db/schema.sql` — four new tables + indexes.
- `server/db/init.js` — one `migrate()` call for `team_members.github_login`.
- `server/index.js` — two `app.use` mounts.
- `server/db/seed.js` — sample PR data.
- `server/package.json` — a `test` script.

**Client — created:**
- `client/src/pages/PullRequestsPage.jsx` — route component; owns filter state and fetching.
- `client/src/pages/GitHubSettingsPage.jsx` — settings tab.
- `client/src/hooks/usePrFilters.js` — URL ↔ filter-object serialization.
- `client/src/components/pr/PrFilterBar.jsx`
- `client/src/components/pr/PrReadinessPanel.jsx`
- `client/src/components/pr/PrSprintComparison.jsx`
- `client/src/components/pr/PrRepoTable.jsx`
- `client/src/components/pr/PrContributorTable.jsx`
- `client/src/components/pr/PrTrendChart.jsx`
- `client/src/components/pr/PrTable.jsx`

**Client — modified:**
- `client/src/App.jsx` — two routes.
- `client/src/components/Layout.jsx` — sidebar entry.
- `client/src/components/SettingsTabs.jsx` — GitHub tab.
- `client/src/pages/TeamMemberPage.jsx` — `github_login` field.

Presentational components take plain data props and never fetch. `PullRequestsPage` is the only client file that calls the API for dashboard data.

---

### Task 1: Database schema

**Files:**
- Modify: `server/db/schema.sql` (append)
- Modify: `server/db/init.js` (add one migrate call alongside the existing ones, ~line 80)

**Interfaces:**
- Produces: tables `github_settings`, `github_repos`, `pull_requests`, `pr_reviews`; column `team_members.github_login`.

- [ ] **Step 1: Append the new tables to `server/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS github_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  base_url TEXT NOT NULL,
  pat_token TEXT NOT NULL,
  sync_days_back INTEGER DEFAULT 180,
  last_sync_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS github_repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  label TEXT DEFAULT '',
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  is_active INTEGER DEFAULT 1,
  last_sync_at TEXT,
  last_sync_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(owner, name)
);

CREATE TABLE IF NOT EXISTS pull_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES github_repos(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('open','merged','closed')),
  is_draft INTEGER DEFAULT 0,
  author_login TEXT,
  author_member_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  base_branch TEXT,
  head_branch TEXT,
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  changed_files INTEGER DEFAULT 0,
  pr_created_at TEXT,
  first_review_at TEXT,
  merged_at TEXT,
  closed_at TEXT,
  jira_key TEXT,
  story_id INTEGER REFERENCES stories(id) ON DELETE SET NULL,
  sprint TEXT,
  sprint_source TEXT CHECK(sprint_source IN ('story','date_window','none')),
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(repo_id, number)
);

CREATE TABLE IF NOT EXISTS pr_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pull_request_id INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  reviewer_login TEXT,
  reviewer_member_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  state TEXT CHECK(state IN ('approved','changes_requested','commented','dismissed')),
  submitted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pull_requests_sprint ON pull_requests(sprint);
CREATE INDEX IF NOT EXISTS idx_pull_requests_repo ON pull_requests(repo_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_author ON pull_requests(author_member_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_story ON pull_requests(story_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_merged_at ON pull_requests(merged_at);
CREATE INDEX IF NOT EXISTS idx_pr_reviews_pr ON pr_reviews(pull_request_id);
CREATE INDEX IF NOT EXISTS idx_pr_reviews_member ON pr_reviews(reviewer_member_id);
```

Note: `pr_reviews` has no UNIQUE constraint. The sync deletes and reinserts all reviews for a PR, so a constraint would add nothing and would wrongly reject two reviews submitted in the same second.

- [ ] **Step 2: Add the column migration in `server/db/init.js`**

Find the block of existing `migrate(...)` calls (after `migrate('todos', 'sort_order', ...)`) and add:

```js
// GitHub integration migrations
migrate('team_members', 'github_login', 'TEXT');
```

- [ ] **Step 3: Verify the schema applies to a fresh and an existing database**

```bash
cd server && node -e "
const db = require('./db/init');
db.init().then(() => {
  const t = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%github%' OR name LIKE 'pr%'\").all();
  console.log(t.map(r => r.name).sort().join(','));
  console.log(db.prepare('PRAGMA table_info(team_members)').all().map(c => c.name).join(','));
  process.exit(0);
});"
```

Expected output line 1: `github_repos,github_settings,pr_reviews,projects,pull_requests`
Expected output line 2 ends with: `github_login`

(`projects` appears because it matches the `pr%` pattern — that is expected.)

- [ ] **Step 4: Commit**

```bash
git add server/db/schema.sql server/db/init.js
git commit -m "feat: add github PR tables and github_login column"
```

---

### Task 2: Jira key and sprint resolution (pure logic, TDD)

**Files:**
- Create: `server/services/prResolve.js`
- Create: `server/services/prResolve.test.js`
- Modify: `server/package.json` (add test script)

**Interfaces:**
- Produces:
  - `parseJiraKey(title: string, headBranch: string) -> string|null`
  - `resolveSprint({ story, plans, mergedAt, createdAt }) -> { sprint: string|null, source: 'story'|'date_window'|'none' }`
    where `story` is `{ sprint }` or null, and `plans` is an array of
    `{ jira_sprint_name, start_date, end_date }`.
  - `firstReviewAt(reviews, authorLogin) -> string|null`
    where `reviews` is an array of `{ author_login, submitted_at }`.
- Consumed by: Task 5 (`githubSync.js`).

- [ ] **Step 1: Add the test script to `server/package.json`**

Change the `scripts` block to:

```json
  "scripts": {
    "dev": "node --watch index.js",
    "start": "node index.js",
    "seed": "node db/seed.js",
    "test": "node --test"
  },
```

- [ ] **Step 2: Write the failing test**

Create `server/services/prResolve.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd server && npm test`
Expected: FAIL — `Cannot find module './prResolve'`

- [ ] **Step 4: Write the implementation**

Create `server/services/prResolve.js`:

```js
const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

/**
 * Extract a Jira issue key from a PR title, falling back to its branch name.
 * Title wins because branches get renamed while titles are curated.
 */
function parseJiraKey(title, headBranch) {
  for (const source of [title, headBranch]) {
    if (!source) continue;
    const match = String(source).match(JIRA_KEY_RE);
    if (match) return match[1];
  }
  return null;
}

/**
 * Attribute a PR to a sprint. Order: the linked story's sprint, then the
 * capacity plan whose date window contains the merge date (or the creation
 * date for still-open PRs). Overlapping windows resolve to the later start.
 */
function resolveSprint({ story, plans, mergedAt, createdAt }) {
  if (story && story.sprint) {
    return { sprint: story.sprint, source: 'story' };
  }

  const stamp = mergedAt || createdAt;
  if (!stamp) return { sprint: null, source: 'none' };
  const day = String(stamp).slice(0, 10);

  const matches = (plans || []).filter(
    (p) => p.jira_sprint_name && p.start_date <= day && day <= p.end_date
  );
  if (matches.length === 0) return { sprint: null, source: 'none' };

  matches.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  return { sprint: matches[0].jira_sprint_name, source: 'date_window' };
}

/** Earliest review timestamp, excluding the PR author's own reviews. */
function firstReviewAt(reviews, authorLogin) {
  const stamps = (reviews || [])
    .filter((r) => r.submitted_at && r.author_login !== authorLogin)
    .map((r) => r.submitted_at)
    .sort();
  return stamps.length ? stamps[0] : null;
}

module.exports = { parseJiraKey, resolveSprint, firstReviewAt };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd server && npm test`
Expected: PASS — `# pass 16`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add server/services/prResolve.js server/services/prResolve.test.js server/package.json
git commit -m "feat: add PR jira-key and sprint resolution logic"
```

---

### Task 3: Shared filter builder (pure logic, TDD)

**Files:**
- Create: `server/services/prFilters.js`
- Create: `server/services/prFilters.test.js`

**Interfaces:**
- Produces: `buildPrFilter(query) -> { where: string, params: any[], scope: object }`
  - `where` is a SQL fragment starting with `WHERE`, or the string `WHERE 1=1` when nothing is filtered. It is always safe to append ` AND ...`.
  - Column references assume the query aliases `pull_requests` as `pr`, `github_repos` as `r`.
  - `scope` is `{ mode: 'sprint'|'release'|'range'|'all', sprints: string[], release: string|null, from: string|null, to: string|null, isSingle: boolean }`. `isSingle` is true when the readiness verdict applies (exactly one sprint, or a release).
- Consumed by: Tasks 6 and 7.

- [ ] **Step 1: Write the failing test**

Create `server/services/prFilters.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPrFilter } = require('./prFilters');

test('no filters produces a neutral clause', () => {
  const { where, params } = buildPrFilter({});
  assert.equal(where, 'WHERE 1=1');
  assert.deepEqual(params, []);
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
  const { where, params } = buildPrFilter({
    repo: ['3'], author: ['7'], state: 'open', project: '2',
  });
  assert.match(where, /pr\.repo_id IN \(\?\)/);
  assert.match(where, /pr\.author_member_id IN \(\?\)/);
  assert.match(where, /pr\.state = \?/);
  assert.match(where, /r\.project_id = \?/);
  assert.deepEqual(params, [3, 7, 'open', 2]);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && npm test`
Expected: FAIL — `Cannot find module './prFilters'`

- [ ] **Step 3: Write the implementation**

Create `server/services/prFilters.js`:

```js
const VALID_STATES = ['open', 'merged', 'closed'];
const VALID_MODES = ['sprint', 'release', 'range', 'all'];

/** Normalize a repeatable query param into an array of non-empty strings. */
function toArray(value) {
  if (value === undefined || value === null || value === '') return [];
  return (Array.isArray(value) ? value : [value]).filter((v) => v !== '' && v != null);
}

/** Keep only values that are genuinely integers; drop anything else. */
function toIntArray(value) {
  return toArray(value)
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));
}

/**
 * Turn dashboard query params into a SQL WHERE fragment and bound params.
 * Queries must alias pull_requests as `pr` and github_repos as `r`.
 * Every value is bound, never interpolated.
 */
function buildPrFilter(query = {}) {
  const clauses = [];
  const params = [];

  const mode = VALID_MODES.includes(query.scope) ? query.scope : 'all';
  const sprints = toArray(query.sprint);
  const release = query.release || null;
  const from = query.from || null;
  const to = query.to || null;

  if (mode === 'sprint' && sprints.length) {
    clauses.push(`pr.sprint IN (${sprints.map(() => '?').join(', ')})`);
    params.push(...sprints);
  } else if (mode === 'release' && release) {
    clauses.push(
      'pr.story_id IN (SELECT id FROM stories WHERE release_date = ?)'
    );
    params.push(release);
  } else if (mode === 'range' && from && to) {
    clauses.push('COALESCE(pr.merged_at, pr.pr_created_at) BETWEEN ? AND ?');
    params.push(from, to);
  }

  const repos = toIntArray(query.repo);
  if (repos.length) {
    clauses.push(`pr.repo_id IN (${repos.map(() => '?').join(', ')})`);
    params.push(...repos);
  }

  const authors = toIntArray(query.author);
  if (authors.length) {
    clauses.push(`pr.author_member_id IN (${authors.map(() => '?').join(', ')})`);
    params.push(...authors);
  }

  if (VALID_STATES.includes(query.state)) {
    clauses.push('pr.state = ?');
    params.push(query.state);
  }

  const projectId = Number(query.project);
  if (Number.isInteger(projectId)) {
    clauses.push('r.project_id = ?');
    params.push(projectId);
  }

  const reviewerId = Number(query.reviewer);
  if (Number.isInteger(reviewerId)) {
    clauses.push(
      'EXISTS (SELECT 1 FROM pr_reviews rv WHERE rv.pull_request_id = pr.id AND rv.reviewer_member_id = ?)'
    );
    params.push(reviewerId);
  }

  const isSingle =
    (mode === 'sprint' && sprints.length === 1) || (mode === 'release' && !!release);

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : 'WHERE 1=1',
    params,
    scope: { mode, sprints, release, from, to, isSingle },
  };
}

module.exports = { buildPrFilter };
```

Note: `Number('')` is `0`, so `project=` (empty) would pass `Number.isInteger`. `toArray` strips empty strings before the array paths; for the scalar `project` and `reviewer` params, an empty string yields `0`, which matches no row — harmless, and simpler than special-casing.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npm test`
Expected: PASS — `# fail 0` across both test files (27 tests total)

- [ ] **Step 5: Commit**

```bash
git add server/services/prFilters.js server/services/prFilters.test.js
git commit -m "feat: add shared PR filter builder"
```

---

### Task 4: GitHub GraphQL client

**Files:**
- Create: `server/services/githubClient.js`

**Interfaces:**
- Produces:
  - `graphql(settings, query, variables) -> Promise<object>` — returns the `data` object. Throws `Error` with `.status` set for HTTP failures and `.rateLimitReset` for 403 rate limits.
  - `fetchPullRequestPage(settings, { owner, name, cursor }) -> Promise<{ nodes: object[], hasNextPage: boolean, endCursor: string|null }>`
  - `graphqlEndpoint(baseUrl) -> string`
- Consumed by: Tasks 5 and 6.

- [ ] **Step 1: Write the implementation**

Create `server/services/githubClient.js`. It follows the `https`/`http` transport style already used in `server/routes/jiraSettings.js`, so the codebase keeps one HTTP idiom.

```js
const https = require('https');
const http = require('http');

const PR_PAGE_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 50, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url state isDraft
        createdAt mergedAt closedAt updatedAt
        additions deletions changedFiles
        author { login }
        baseRefName headRefName
        reviews(first: 20) { nodes { author { login } state submittedAt } }
      }
    }
  }
}`;

/**
 * GitHub cloud uses https://api.github.com/graphql; GHES uses
 * https://host/api/graphql. Accept either form of base_url.
 */
function graphqlEndpoint(baseUrl) {
  const trimmed = String(baseUrl).replace(/\/+$/, '');
  return trimmed.endsWith('/graphql') ? trimmed : `${trimmed}/graphql`;
}

function graphql(settings, query, variables) {
  const endpoint = graphqlEndpoint(settings.base_url);
  const parsed = new URL(endpoint);
  const transport = parsed.protocol === 'https:' ? https : http;
  const payload = JSON.stringify({ query, variables });

  return new Promise((resolve, reject) => {
    const req = transport.request(
      endpoint,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.pat_token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'manager-os',
          Accept: 'application/json',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(
              `GitHub API error: ${res.statusCode} ${res.statusMessage}`
            );
            error.status = res.statusCode;
            if (res.statusCode === 403 && res.headers['x-ratelimit-reset']) {
              error.rateLimitReset = Number(res.headers['x-ratelimit-reset']);
            }
            return reject(error);
          }
          let json;
          try {
            json = JSON.parse(body);
          } catch {
            return reject(new Error('Invalid JSON response from GitHub'));
          }
          if (json.errors && json.errors.length) {
            const error = new Error(json.errors.map((e) => e.message).join('; '));
            error.status = 200;
            return reject(error);
          }
          resolve(json.data);
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function fetchPullRequestPage(settings, { owner, name, cursor }) {
  const data = await graphql(settings, PR_PAGE_QUERY, { owner, name, cursor: cursor || null });
  if (!data || !data.repository) {
    const error = new Error(`Repository not found: ${owner}/${name}`);
    error.status = 404;
    throw error;
  }
  const page = data.repository.pullRequests;
  return {
    nodes: page.nodes || [],
    hasNextPage: page.pageInfo.hasNextPage,
    endCursor: page.pageInfo.endCursor,
  };
}

module.exports = { graphql, fetchPullRequestPage, graphqlEndpoint };
```

- [ ] **Step 2: Verify the endpoint helper handles both GitHub forms**

```bash
cd server && node -e "
const { graphqlEndpoint } = require('./services/githubClient');
console.log(graphqlEndpoint('https://api.github.com'));
console.log(graphqlEndpoint('https://ghe.corp.com/api/'));
console.log(graphqlEndpoint('https://api.github.com/graphql'));
"
```

Expected:
```
https://api.github.com/graphql
https://ghe.corp.com/api/graphql
https://api.github.com/graphql
```

- [ ] **Step 3: Commit**

```bash
git add server/services/githubClient.js
git commit -m "feat: add github graphql client"
```

---

### Task 5: Sync service

**Files:**
- Create: `server/services/githubSync.js`

**Interfaces:**
- Consumes: `prResolve.js` (Task 2), `githubClient.js` (Task 4).
- Produces: `syncAll() -> Promise<{ synced, failed, counts }>` shaped exactly as the spec's response contract.
- Consumed by: Task 6.

- [ ] **Step 1: Write the implementation**

Create `server/services/githubSync.js`:

```js
const db = require('../db/init');
const { fetchPullRequestPage } = require('./githubClient');
const { parseJiraKey, resolveSprint, firstReviewAt } = require('./prResolve');

const STATE_MAP = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' };
const REVIEW_STATE_MAP = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
  COMMENTED: 'commented',
  DISMISSED: 'dismissed',
};

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

/** Build login -> team_member_id, lowercased so matching is case-insensitive. */
function loadMemberMap() {
  const rows = db
    .prepare("SELECT id, github_login FROM team_members WHERE github_login IS NOT NULL AND github_login != ''")
    .all();
  const map = new Map();
  rows.forEach((r) => map.set(String(r.github_login).toLowerCase(), r.id));
  return map;
}

function loadPlans() {
  return db
    .prepare(
      "SELECT jira_sprint_name, start_date, end_date FROM capacity_plans WHERE jira_sprint_name IS NOT NULL AND jira_sprint_name != ''"
    )
    .all();
}

/** Flatten one GraphQL PR node into the row shape plus its reviews. */
function mapNode(node, { repoId, plans, memberMap }) {
  const authorLogin = node.author ? node.author.login : null;
  const reviews = (node.reviews && node.reviews.nodes ? node.reviews.nodes : [])
    .filter((rv) => rv && rv.submittedAt)
    .map((rv) => ({
      author_login: rv.author ? rv.author.login : null,
      submitted_at: rv.submittedAt,
      state: REVIEW_STATE_MAP[rv.state] || 'commented',
    }));

  const jiraKey = parseJiraKey(node.title, node.headRefName);
  const story = jiraKey
    ? db.prepare('SELECT id, sprint FROM stories WHERE key = ?').get(jiraKey)
    : null;

  const { sprint, source } = resolveSprint({
    story: story || null,
    plans,
    mergedAt: node.mergedAt,
    createdAt: node.createdAt,
  });

  return {
    row: {
      repo_id: repoId,
      number: node.number,
      title: node.title,
      url: node.url,
      state: STATE_MAP[node.state] || 'closed',
      is_draft: node.isDraft ? 1 : 0,
      author_login: authorLogin,
      author_member_id: authorLogin
        ? memberMap.get(String(authorLogin).toLowerCase()) || null
        : null,
      base_branch: node.baseRefName,
      head_branch: node.headRefName,
      additions: node.additions || 0,
      deletions: node.deletions || 0,
      changed_files: node.changedFiles || 0,
      pr_created_at: node.createdAt,
      first_review_at: firstReviewAt(reviews, authorLogin),
      merged_at: node.mergedAt,
      closed_at: node.closedAt,
      jira_key: jiraKey,
      story_id: story ? story.id : null,
      sprint,
      sprint_source: source,
    },
    reviews,
  };
}

const UPSERT_PR = `
INSERT INTO pull_requests (
  repo_id, number, title, url, state, is_draft, author_login, author_member_id,
  base_branch, head_branch, additions, deletions, changed_files,
  pr_created_at, first_review_at, merged_at, closed_at,
  jira_key, story_id, sprint, sprint_source, synced_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
ON CONFLICT(repo_id, number) DO UPDATE SET
  title = excluded.title, url = excluded.url, state = excluded.state,
  is_draft = excluded.is_draft, author_login = excluded.author_login,
  author_member_id = excluded.author_member_id,
  base_branch = excluded.base_branch, head_branch = excluded.head_branch,
  additions = excluded.additions, deletions = excluded.deletions,
  changed_files = excluded.changed_files,
  pr_created_at = excluded.pr_created_at, first_review_at = excluded.first_review_at,
  merged_at = excluded.merged_at, closed_at = excluded.closed_at,
  jira_key = excluded.jira_key, story_id = excluded.story_id,
  sprint = excluded.sprint, sprint_source = excluded.sprint_source,
  synced_at = datetime('now')`;

/** Persist one page of mapped PRs. Called inside a transaction. */
function persist(mapped, memberMap) {
  mapped.forEach(({ row, reviews }) => {
    db.prepare(UPSERT_PR).run(
      row.repo_id, row.number, row.title, row.url, row.state, row.is_draft,
      row.author_login, row.author_member_id, row.base_branch, row.head_branch,
      row.additions, row.deletions, row.changed_files, row.pr_created_at,
      row.first_review_at, row.merged_at, row.closed_at, row.jira_key,
      row.story_id, row.sprint, row.sprint_source
    );

    const saved = db
      .prepare('SELECT id FROM pull_requests WHERE repo_id = ? AND number = ?')
      .get(row.repo_id, row.number);

    db.prepare('DELETE FROM pr_reviews WHERE pull_request_id = ?').run(saved.id);
    reviews.forEach((rv) => {
      db.prepare(
        'INSERT INTO pr_reviews (pull_request_id, reviewer_login, reviewer_member_id, state, submitted_at) VALUES (?,?,?,?,?)'
      ).run(
        saved.id,
        rv.author_login,
        rv.author_login ? memberMap.get(String(rv.author_login).toLowerCase()) || null : null,
        rv.state,
        rv.submitted_at
      );
    });
  });
}

/** Walk a repo's PRs newest-first, stopping once updatedAt predates the cutoff. */
async function syncRepo(settings, repo, cutoff, plans, memberMap) {
  let cursor = null;
  let count = 0;

  for (;;) {
    const page = await fetchPullRequestPage(settings, {
      owner: repo.owner,
      name: repo.name,
      cursor,
    });

    const fresh = page.nodes.filter((n) => n.updatedAt > cutoff);
    const mapped = fresh.map((n) =>
      mapNode(n, { repoId: repo.id, plans, memberMap })
    );

    if (mapped.length) {
      db.transaction(() => persist(mapped, memberMap))();
      count += mapped.length;
    }

    const reachedCutoff = fresh.length < page.nodes.length;
    if (reachedCutoff || !page.hasNextPage) break;
    cursor = page.endCursor;
  }

  return count;
}

/**
 * Sync every active repo. Repos fail independently; a 401 aborts the run
 * because a bad token fails for all of them.
 */
async function syncAll() {
  const settings = db.prepare("SELECT * FROM github_settings WHERE id = 'default'").get();
  if (!settings) {
    const error = new Error('GitHub is not configured');
    error.status = 400;
    throw error;
  }

  const repos = db.prepare('SELECT * FROM github_repos WHERE is_active = 1').all();
  const cutoff = settings.last_sync_at || isoDaysAgo(settings.sync_days_back || 180);
  const plans = loadPlans();
  const memberMap = loadMemberMap();

  const synced = [];
  const failed = [];

  for (const repo of repos) {
    const slug = `${repo.owner}/${repo.name}`;
    try {
      const prs = await syncRepo(settings, repo, cutoff, plans, memberMap);
      db.prepare(
        "UPDATE github_repos SET last_sync_at = datetime('now'), last_sync_error = NULL WHERE id = ?"
      ).run(repo.id);
      synced.push({ repo: slug, prs });
    } catch (err) {
      if (err.status === 401) throw err;
      db.prepare('UPDATE github_repos SET last_sync_error = ? WHERE id = ?').run(
        err.message,
        repo.id
      );
      failed.push({ repo: slug, error: err.message });
      if (err.rateLimitReset) break;
    }
  }

  if (synced.length) {
    db.prepare(
      "UPDATE github_settings SET last_sync_at = datetime('now'), updated_at = datetime('now') WHERE id = 'default'"
    ).run();
  }

  return {
    synced,
    failed,
    counts: {
      repos: repos.length,
      succeeded: synced.length,
      prs: synced.reduce((sum, s) => sum + s.prs, 0),
    },
  };
}

module.exports = { syncAll, mapNode };
```

Two things worth understanding here. `last_sync_at` advances only when at least one repo succeeded, so a total failure never skips a window of history. And a rate-limit error breaks the loop rather than continuing, because the remaining repos would fail identically — but the repos already committed keep their data.

- [ ] **Step 2: Verify the module loads and `mapNode` resolves a PR correctly**

```bash
cd server && node -e "
const db = require('./db/init');
db.init().then(() => {
  const { mapNode } = require('./services/githubSync');
  const node = {
    number: 1, title: 'PAY-999 test', url: 'u', state: 'MERGED', isDraft: false,
    createdAt: '2026-07-01T00:00:00Z', mergedAt: '2026-07-02T00:00:00Z', closedAt: null,
    updatedAt: '2026-07-02T00:00:00Z', additions: 5, deletions: 1, changedFiles: 2,
    author: { login: 'someone' }, baseRefName: 'main', headRefName: 'f/x',
    reviews: { nodes: [] },
  };
  const out = mapNode(node, { repoId: 1, plans: [], memberMap: new Map() });
  console.log(out.row.jira_key, out.row.state, out.row.sprint_source);
  process.exit(0);
});"
```

Expected: `PAY-999 merged none`

- [ ] **Step 3: Commit**

```bash
git add server/services/githubSync.js
git commit -m "feat: add github PR sync service"
```

---

### Task 6: GitHub settings routes

**Files:**
- Create: `server/routes/githubSettings.js`
- Modify: `server/index.js` (add require near the other route requires, and `app.use` after line 53)

**Interfaces:**
- Consumes: `githubSync.syncAll()` (Task 5), `githubClient.graphql()` (Task 4).
- Produces: `GET/PUT /api/settings/github`, `POST /api/settings/github/test`, `GET/POST/PUT/DELETE /api/settings/github/repos[/:id]`, `POST /api/settings/github/sync`.

- [ ] **Step 1: Write the router**

Create `server/routes/githubSettings.js`:

```js
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { graphql } = require('../services/githubClient');
const { syncAll } = require('../services/githubSync');

function getSettings() {
  return db.prepare("SELECT * FROM github_settings WHERE id = 'default'").get();
}

function maskToken(token) {
  if (!token || token.length < 8) return '****';
  return token.slice(0, 4) + '****' + token.slice(-4);
}

// --- Settings --------------------------------------------------------------

router.get('/', (req, res) => {
  const settings = getSettings();
  if (!settings) return res.json(null);
  res.json({
    base_url: settings.base_url,
    pat_token: maskToken(settings.pat_token),
    sync_days_back: settings.sync_days_back,
    last_sync_at: settings.last_sync_at,
  });
});

router.put('/', (req, res) => {
  const { base_url, pat_token, sync_days_back } = req.body;
  if (!base_url) return res.status(400).json({ error: 'base_url is required' });

  const existing = getSettings();
  // A masked token means "unchanged" — never overwrite a real token with stars.
  const token =
    pat_token && !pat_token.includes('****')
      ? pat_token
      : existing
        ? existing.pat_token
        : null;
  if (!token) return res.status(400).json({ error: 'pat_token is required' });

  if (existing) {
    db.prepare(
      "UPDATE github_settings SET base_url = ?, pat_token = ?, sync_days_back = ?, updated_at = datetime('now') WHERE id = 'default'"
    ).run(base_url, token, sync_days_back || 180);
  } else {
    db.prepare(
      "INSERT INTO github_settings (id, base_url, pat_token, sync_days_back) VALUES ('default', ?, ?, ?)"
    ).run(base_url, token, sync_days_back || 180);
  }
  res.json({ ok: true });
});

router.post('/test', async (req, res) => {
  const settings = getSettings();
  if (!settings) return res.status(400).json({ error: 'GitHub is not configured' });
  try {
    const data = await graphql(settings, '{ viewer { login } }', {});
    res.json({ ok: true, login: data.viewer.login });
  } catch (err) {
    res.status(err.status === 401 ? 401 : 502).json({ error: err.message });
  }
});

// --- Repos -----------------------------------------------------------------

router.get('/repos', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT r.*, p.name AS project_name
         FROM github_repos r
         LEFT JOIN projects p ON p.id = r.project_id
         ORDER BY r.owner, r.name`
      )
      .all()
  );
});

router.post('/repos', (req, res) => {
  const { owner, name, label, project_id } = req.body;
  if (!owner || !name) {
    return res.status(400).json({ error: 'owner and name are required' });
  }
  const existing = db
    .prepare('SELECT id FROM github_repos WHERE owner = ? AND name = ?')
    .get(owner, name);
  if (existing) return res.status(409).json({ error: 'Repo already tracked' });

  db.prepare(
    'INSERT INTO github_repos (owner, name, label, project_id) VALUES (?,?,?,?)'
  ).run(owner, name, label || '', project_id || null);
  res.status(201).json({ ok: true });
});

router.put('/repos/:id', (req, res) => {
  const { label, project_id, is_active } = req.body;
  db.prepare(
    'UPDATE github_repos SET label = ?, project_id = ?, is_active = ? WHERE id = ?'
  ).run(label || '', project_id || null, is_active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/repos/:id', (req, res) => {
  db.prepare('DELETE FROM github_repos WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- Sync ------------------------------------------------------------------

router.post('/sync', async (req, res) => {
  try {
    res.json(await syncAll());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount the router in `server/index.js`**

Add alongside the other route requires at the top:

```js
const githubSettingsRouter = require('./routes/githubSettings');
```

Add after the `app.use('/api/settings/app', appSettingsRouter);` line:

```js
app.use('/api/settings/github', githubSettingsRouter);
```

- [ ] **Step 3: Verify the routes respond**

Start the server (`cd server && npm run dev`), then in another shell:

```bash
curl -s localhost:3001/api/settings/github; echo
curl -s -X PUT localhost:3001/api/settings/github -H 'Content-Type: application/json' -d '{"base_url":"https://api.github.com","pat_token":"ghp_testtoken1234"}'; echo
curl -s localhost:3001/api/settings/github; echo
curl -s -X POST localhost:3001/api/settings/github/repos -H 'Content-Type: application/json' -d '{"owner":"acme","name":"api"}'; echo
curl -s localhost:3001/api/settings/github/repos; echo
```

Expected in order: `null`; `{"ok":true}`; settings JSON with `"pat_token":"ghp_****1234"`; `{"ok":true}`; a one-element array containing `acme/api`.

- [ ] **Step 4: Commit**

```bash
git add server/routes/githubSettings.js server/index.js
git commit -m "feat: add github settings and sync routes"
```

---

### Task 7: Dashboard read routes

**Files:**
- Create: `server/routes/pullRequests.js`
- Modify: `server/index.js` (require + mount)

**Interfaces:**
- Consumes: `buildPrFilter(query)` (Task 3).
- Produces these endpoints, all accepting the same filter params:
  - `GET /api/pull-requests` → `{ rows: PrRow[], total: number }`
  - `GET /api/pull-requests/summary` → `{ merged, open, closed, stale, total, storiesWithoutMergedPr: [{key, summary}] }`
  - `GET /api/pull-requests/by-sprint` → `[{ sprint, merged, open, stale, median_merge_days }]`
  - `GET /api/pull-requests/by-repo` → `[{ id, slug, project_name, open, merged, stale, oldest_open_days, median_merge_days, last_sync_error }]`
  - `GET /api/pull-requests/by-author` → `[{ member_id, name, authored, reviews_given, median_size }]`
  - `GET /api/pull-requests/filters` → `{ sprints, repos, authors, projects, releases, lastSyncAt }`
  - `PrRow` = `{ id, number, title, url, state, repo_slug, author_login, author_name, jira_key, sprint, sprint_source, additions, deletions, pr_created_at, merged_at, is_stale }`

- [ ] **Step 1: Write the router**

Create `server/routes/pullRequests.js`:

```js
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { buildPrFilter } = require('../services/prFilters');

// An open, non-draft PR with no review, older than 3 days.
const STALE_SQL = `
  (pr.state = 'open' AND pr.is_draft = 0 AND pr.first_review_at IS NULL
   AND julianday('now') - julianday(pr.pr_created_at) > 3)`;

/** Median of a numeric array. Returns null for an empty array. */
function median(values) {
  const nums = values.filter((v) => v !== null && v !== undefined).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function round1(value) {
  return value === null ? null : Math.round(value * 10) / 10;
}

// --- PR list ---------------------------------------------------------------

const SORTABLE = {
  number: 'pr.number',
  title: 'pr.title',
  state: 'pr.state',
  author: 'pr.author_login',
  sprint: 'pr.sprint',
  size: '(pr.additions + pr.deletions)',
  created: 'pr.pr_created_at',
  merged: 'pr.merged_at',
};

router.get('/', (req, res) => {
  const { where, params } = buildPrFilter(req.query);
  const sortCol = SORTABLE[req.query.sort] || 'pr.pr_created_at';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const offset = Number(req.query.offset) || 0;

  const rows = db
    .prepare(
      `SELECT pr.id, pr.number, pr.title, pr.url, pr.state, pr.is_draft,
              pr.author_login, pr.jira_key, pr.sprint, pr.sprint_source,
              pr.additions, pr.deletions, pr.pr_created_at, pr.merged_at,
              r.owner || '/' || r.name AS repo_slug,
              tm.name AS author_name,
              ${STALE_SQL} AS is_stale
       FROM pull_requests pr
       JOIN github_repos r ON r.id = pr.repo_id
       LEFT JOIN team_members tm ON tm.id = pr.author_member_id
       ${where}
       ORDER BY ${sortCol} ${dir}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const total = db
    .prepare(
      `SELECT COUNT(*) AS n FROM pull_requests pr
       JOIN github_repos r ON r.id = pr.repo_id ${where}`
    )
    .get(...params).n;

  res.json({ rows, total });
});

// --- Readiness summary -----------------------------------------------------

router.get('/summary', (req, res) => {
  const { where, params, scope } = buildPrFilter(req.query);

  const counts = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN pr.state = 'merged' THEN 1 ELSE 0 END) AS merged,
         SUM(CASE WHEN pr.state = 'open' THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN pr.state = 'closed' THEN 1 ELSE 0 END) AS closed,
         SUM(CASE WHEN ${STALE_SQL} THEN 1 ELSE 0 END) AS stale
       FROM pull_requests pr
       JOIN github_repos r ON r.id = pr.repo_id ${where}`
    )
    .get(...params);

  // Stories in scope with no merged PR — including stories with no PRs at all.
  let storiesWithoutMergedPr = [];
  if (scope.isSingle) {
    if (scope.mode === 'sprint') {
      storiesWithoutMergedPr = db
        .prepare(
          `SELECT s.key, s.summary FROM stories s
           WHERE s.sprint = ?
             AND NOT EXISTS (
               SELECT 1 FROM pull_requests p
               WHERE p.story_id = s.id AND p.state = 'merged')
           ORDER BY s.key`
        )
        .all(scope.sprints[0]);
    } else {
      storiesWithoutMergedPr = db
        .prepare(
          `SELECT s.key, s.summary FROM stories s
           WHERE s.release_date = ?
             AND NOT EXISTS (
               SELECT 1 FROM pull_requests p
               WHERE p.story_id = s.id AND p.state = 'merged')
           ORDER BY s.key`
        )
        .all(scope.release);
    }
  }

  res.json({
    total: counts.total || 0,
    merged: counts.merged || 0,
    open: counts.open || 0,
    closed: counts.closed || 0,
    stale: counts.stale || 0,
    isSingle: scope.isSingle,
    storiesWithoutMergedPr,
  });
});

// --- Per-sprint comparison -------------------------------------------------

router.get('/by-sprint', (req, res) => {
  const { where, params } = buildPrFilter(req.query);

  const rows = db
    .prepare(
      `SELECT pr.sprint, pr.state, pr.merged_at, pr.pr_created_at,
              ${STALE_SQL} AS is_stale
       FROM pull_requests pr
       JOIN github_repos r ON r.id = pr.repo_id
       ${where} AND pr.sprint IS NOT NULL`
    )
    .all(...params);

  const bySprint = new Map();
  rows.forEach((row) => {
    if (!bySprint.has(row.sprint)) {
      bySprint.set(row.sprint, { sprint: row.sprint, merged: 0, open: 0, stale: 0, days: [] });
    }
    const entry = bySprint.get(row.sprint);
    if (row.state === 'merged') {
      entry.merged += 1;
      if (row.merged_at && row.pr_created_at) {
        entry.days.push(
          (new Date(row.merged_at) - new Date(row.pr_created_at)) / 86400000
        );
      }
    }
    if (row.state === 'open') entry.open += 1;
    if (row.is_stale) entry.stale += 1;
  });

  const result = [...bySprint.values()]
    .map(({ days, ...rest }) => ({ ...rest, median_merge_days: round1(median(days)) }))
    .sort((a, b) => a.sprint.localeCompare(b.sprint, undefined, { numeric: true }));

  res.json(result);
});

// --- Per-repo breakdown ----------------------------------------------------

router.get('/by-repo', (req, res) => {
  const { where, params } = buildPrFilter(req.query);

  const rows = db
    .prepare(
      `SELECT r.id, r.owner || '/' || r.name AS slug, r.last_sync_error,
              p.name AS project_name,
              pr.state, pr.merged_at, pr.pr_created_at, ${STALE_SQL} AS is_stale
       FROM github_repos r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN pull_requests pr ON pr.repo_id = r.id
       ${where.replace('WHERE', 'AND').replace('AND 1=1', '')}
       WHERE r.is_active = 1`
    )
    .all(...params);

  const byRepo = new Map();
  rows.forEach((row) => {
    if (!byRepo.has(row.id)) {
      byRepo.set(row.id, {
        id: row.id,
        slug: row.slug,
        project_name: row.project_name,
        last_sync_error: row.last_sync_error,
        open: 0, merged: 0, stale: 0, days: [], openAges: [],
      });
    }
    const entry = byRepo.get(row.id);
    if (!row.state) return; // repo with no matching PRs
    if (row.state === 'merged') {
      entry.merged += 1;
      if (row.merged_at && row.pr_created_at) {
        entry.days.push((new Date(row.merged_at) - new Date(row.pr_created_at)) / 86400000);
      }
    }
    if (row.state === 'open') {
      entry.open += 1;
      if (row.pr_created_at) {
        entry.openAges.push((Date.now() - new Date(row.pr_created_at)) / 86400000);
      }
    }
    if (row.is_stale) entry.stale += 1;
  });

  res.json(
    [...byRepo.values()]
      .map(({ days, openAges, ...rest }) => ({
        ...rest,
        median_merge_days: round1(median(days)),
        oldest_open_days: openAges.length ? Math.round(Math.max(...openAges)) : null,
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug))
  );
});

// --- Per-author breakdown --------------------------------------------------

router.get('/by-author', (req, res) => {
  const { where, params } = buildPrFilter(req.query);

  const authored = db
    .prepare(
      `SELECT pr.author_member_id AS member_id, pr.author_login,
              tm.name AS member_name, pr.additions + pr.deletions AS size
       FROM pull_requests pr
       JOIN github_repos r ON r.id = pr.repo_id
       LEFT JOIN team_members tm ON tm.id = pr.author_member_id
       ${where}`
    )
    .all(...params);

  const reviews = db
    .prepare(
      `SELECT rv.reviewer_member_id AS member_id, rv.reviewer_login,
              COUNT(*) AS n
       FROM pr_reviews rv
       JOIN pull_requests pr ON pr.id = rv.pull_request_id
       JOIN github_repos r ON r.id = pr.repo_id
       ${where}
       GROUP BY rv.reviewer_member_id, rv.reviewer_login`
    )
    .all(...params);

  // Key on the member id when mapped, otherwise the raw login, so unmapped
  // GitHub users still appear instead of collapsing into one null row.
  const people = new Map();
  function entry(memberId, login, name) {
    const key = memberId ? `m${memberId}` : `l${login || 'unknown'}`;
    if (!people.has(key)) {
      people.set(key, {
        member_id: memberId || null,
        name: name || login || 'unknown',
        authored: 0, reviews_given: 0, sizes: [],
      });
    }
    return people.get(key);
  }

  authored.forEach((row) => {
    const person = entry(row.member_id, row.author_login, row.member_name);
    person.authored += 1;
    if (row.size !== null) person.sizes.push(row.size);
  });
  reviews.forEach((row) => {
    entry(row.member_id, row.reviewer_login, null).reviews_given += row.n;
  });

  res.json(
    [...people.values()]
      .map(({ sizes, ...rest }) => ({ ...rest, median_size: median(sizes) }))
      .sort((a, b) => b.authored - a.authored)
  );
});

// --- Filter options --------------------------------------------------------

router.get('/filters', (req, res) => {
  const settings = db.prepare("SELECT last_sync_at FROM github_settings WHERE id = 'default'").get();
  res.json({
    sprints: db
      .prepare("SELECT DISTINCT sprint FROM pull_requests WHERE sprint IS NOT NULL ORDER BY sprint DESC")
      .all()
      .map((r) => r.sprint),
    releases: db
      .prepare("SELECT DISTINCT release_date FROM stories WHERE release_date IS NOT NULL ORDER BY release_date DESC")
      .all()
      .map((r) => r.release_date),
    repos: db
      .prepare("SELECT id, owner || '/' || name AS slug FROM github_repos WHERE is_active = 1 ORDER BY owner, name")
      .all(),
    authors: db
      .prepare(
        `SELECT DISTINCT tm.id, tm.name FROM team_members tm
         JOIN pull_requests pr ON pr.author_member_id = tm.id ORDER BY tm.name`
      )
      .all(),
    projects: db.prepare('SELECT id, name FROM projects ORDER BY name').all(),
    lastSyncAt: settings ? settings.last_sync_at : null,
  });
});

module.exports = router;
```

Note on `/by-repo`: it must LEFT JOIN from repos so a repo with zero matching PRs still returns a row (that is how a failed-sync repo shows up at all). The filter clause therefore moves into the JOIN condition rather than the WHERE.

- [ ] **Step 2: Mount the router in `server/index.js`**

Add the require:

```js
const pullRequestsRouter = require('./routes/pullRequests');
```

Add the mount after the GitHub settings mount:

```js
app.use('/api/pull-requests', pullRequestsRouter);
```

- [ ] **Step 3: Verify every endpoint returns valid JSON on an empty database**

```bash
for p in "" "/summary" "/by-sprint" "/by-repo" "/by-author" "/filters"; do
  echo "== $p"; curl -s "localhost:3001/api/pull-requests$p?scope=all"; echo
done
```

Expected: six JSON responses, no 500s. `""` returns `{"rows":[],"total":0}`; `/summary` returns zeros with `"storiesWithoutMergedPr":[]`; the three breakdowns return `[]`; `/filters` returns the option lists.

- [ ] **Step 4: Commit**

```bash
git add server/routes/pullRequests.js server/index.js
git commit -m "feat: add pull request dashboard endpoints"
```

---

### Task 8: Seed data

**Files:**
- Modify: `server/db/seed.js` (append a PR block before the script's final save/exit)

**Interfaces:**
- Produces: sample repos, PRs, and reviews covering every case the UI must render.

- [ ] **Step 1: Read the existing seed file to match its style**

Run: `cd server && head -40 db/seed.js` — note how it clears tables and inserts, and follow the same shape.

- [ ] **Step 2: Append the seed block**

Add before the final save/exit in `server/db/seed.js`:

```js
// --- GitHub PR sample data -------------------------------------------------

db.prepare('DELETE FROM pr_reviews').run();
db.prepare('DELETE FROM pull_requests').run();
db.prepare('DELETE FROM github_repos').run();

db.prepare(
  "INSERT INTO github_settings (id, base_url, pat_token, sync_days_back, last_sync_at) VALUES ('default','https://api.github.com','ghp_seedtoken0000',180,datetime('now')) ON CONFLICT(id) DO NOTHING"
).run();

const firstProject = db.prepare('SELECT id FROM projects ORDER BY id LIMIT 1').get();
const members = db.prepare('SELECT id, name FROM team_members ORDER BY id LIMIT 3').all();

// Give the first two members a GitHub login; leave the third unmapped so the
// UI's "raw login" path is exercised.
if (members[0]) db.prepare('UPDATE team_members SET github_login = ? WHERE id = ?').run('ahmed', members[0].id);
if (members[1]) db.prepare('UPDATE team_members SET github_login = ? WHERE id = ?').run('sara', members[1].id);

const repoRows = [
  ['acme', 'api', 'API', firstProject ? firstProject.id : null, null],
  ['acme', 'web', 'Web', firstProject ? firstProject.id : null, null],
  ['acme', 'legacy-billing', 'Legacy billing', null, '404 Not Found'],
];
repoRows.forEach(([owner, name, label, projectId, err]) => {
  db.prepare(
    "INSERT INTO github_repos (owner, name, label, project_id, is_active, last_sync_at, last_sync_error) VALUES (?,?,?,?,1,datetime('now'),?)"
  ).run(owner, name, label, projectId, err);
});

const apiRepo = db.prepare("SELECT id FROM github_repos WHERE name = 'api'").get();
const webRepo = db.prepare("SELECT id FROM github_repos WHERE name = 'web'").get();
const story = db.prepare('SELECT id, sprint FROM stories WHERE sprint IS NOT NULL ORDER BY id LIMIT 1').get();
const sprintName = story ? story.sprint : 'Sprint 1';

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

const prs = [
  // linked to a real story, merged, by a mapped member
  { repo: apiRepo.id, number: 412, title: `${story ? 'KEY' : 'PAY'}-118 add refund webhook`,
    state: 'merged', author: 'ahmed', member: members[0] ? members[0].id : null,
    storyId: story ? story.id : null, jira: 'PAY-118', sprint: sprintName, source: 'story',
    created: daysAgo(9), merged: daysAgo(7), review: daysAgo(8), add: 210, del: 40 },
  // open and stale: no review, older than 3 days
  { repo: webRepo.id, number: 409, title: 'PAY-120 checkout error states',
    state: 'open', author: 'sara', member: members[1] ? members[1].id : null,
    storyId: null, jira: 'PAY-120', sprint: sprintName, source: 'story',
    created: daysAgo(11), merged: null, review: null, add: 88, del: 12 },
  // no Jira key, attributed by date window
  { repo: apiRepo.id, number: 404, title: 'bump deps',
    state: 'merged', author: 'omar', member: null,
    storyId: null, jira: null, sprint: sprintName, source: 'date_window',
    created: daysAgo(5), merged: daysAgo(5), review: daysAgo(5), add: 6, del: 6 },
  // open but fresh, so not stale
  { repo: webRepo.id, number: 415, title: 'OPS-77 sprint burndown fix',
    state: 'open', author: 'ahmed', member: members[0] ? members[0].id : null,
    storyId: null, jira: 'OPS-77', sprint: sprintName, source: 'story',
    created: daysAgo(1), merged: null, review: null, add: 45, del: 30 },
];

prs.forEach((pr) => {
  db.prepare(
    `INSERT INTO pull_requests (
       repo_id, number, title, url, state, is_draft, author_login, author_member_id,
       base_branch, head_branch, additions, deletions, changed_files,
       pr_created_at, first_review_at, merged_at, closed_at,
       jira_key, story_id, sprint, sprint_source
     ) VALUES (?,?,?,?,?,0,?,?,'main','feature/x',?,?,3,?,?,?,NULL,?,?,?,?)`
  ).run(
    pr.repo, pr.number, pr.title,
    `https://github.com/acme/repo/pull/${pr.number}`,
    pr.state, pr.author, pr.member, pr.add, pr.del,
    pr.created, pr.review, pr.merged, pr.jira, pr.storyId, pr.sprint, pr.source
  );

  if (pr.review) {
    const saved = db
      .prepare('SELECT id FROM pull_requests WHERE repo_id = ? AND number = ?')
      .get(pr.repo, pr.number);
    const reviewer = pr.author === 'ahmed' ? 'sara' : 'ahmed';
    const reviewerMember = reviewer === 'ahmed'
      ? (members[0] ? members[0].id : null)
      : (members[1] ? members[1].id : null);
    db.prepare(
      'INSERT INTO pr_reviews (pull_request_id, reviewer_login, reviewer_member_id, state, submitted_at) VALUES (?,?,?,?,?)'
    ).run(saved.id, reviewer, reviewerMember, 'approved', pr.review);
  }
});

console.log('Seeded 3 github repos and 4 pull requests');
```

- [ ] **Step 3: Run the seed and verify the data covers every case**

```bash
cd server && npm run seed && node -e "
const db = require('./db/init');
db.init().then(() => {
  console.log('prs', db.prepare('SELECT COUNT(*) n FROM pull_requests').get().n);
  console.log('reviews', db.prepare('SELECT COUNT(*) n FROM pr_reviews').get().n);
  console.log('no-key', db.prepare('SELECT COUNT(*) n FROM pull_requests WHERE jira_key IS NULL').get().n);
  console.log('date-window', db.prepare(\"SELECT COUNT(*) n FROM pull_requests WHERE sprint_source='date_window'\").get().n);
  console.log('failed-repo', db.prepare('SELECT COUNT(*) n FROM github_repos WHERE last_sync_error IS NOT NULL').get().n);
  process.exit(0);
});"
```

Expected: `prs 4`, `reviews 3`, `no-key 1`, `date-window 1`, `failed-repo 1`

- [ ] **Step 4: Verify the endpoints now return real numbers**

```bash
curl -s "localhost:3001/api/pull-requests/summary?scope=all"; echo
curl -s "localhost:3001/api/pull-requests/by-repo?scope=all"; echo
curl -s "localhost:3001/api/pull-requests/by-author?scope=all"; echo
```

Expected: `summary` shows `"merged":2,"open":2,"stale":1`. `by-repo` returns 3 rows including `acme/legacy-billing` with `last_sync_error` set and zero counts. `by-author` includes an entry named `omar` (the unmapped login) with `member_id: null`.

- [ ] **Step 5: Commit**

```bash
git add server/db/seed.js
git commit -m "feat: seed sample github PR data"
```

---

### Task 9: Filter state hook and page shell

**Files:**
- Create: `client/src/hooks/usePrFilters.js`
- Create: `client/src/pages/PullRequestsPage.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Layout.jsx`

**Interfaces:**
- Produces:
  - `usePrFilters() -> { filters, setFilter(key, value), toggleArrayValue(key, value), clearAll(), queryString }`
    - `filters` = `{ scope, sprint: string[], release, from, to, repo: string[], author: string[], state, project, reviewer }`
    - `queryString` is the serialized `?a=b&...` form (no leading `?`) to append to API calls.
  - Route `/pull-requests` rendering `PullRequestsPage`.
- Consumed by: Tasks 10–13.

- [ ] **Step 1: Write the filter hook**

Create `client/src/hooks/usePrFilters.js`:

```js
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const ARRAY_KEYS = ['sprint', 'repo', 'author'];
const SCALAR_KEYS = ['scope', 'release', 'from', 'to', 'state', 'project', 'reviewer'];

/**
 * Filter state lives in the URL so any view is bookmarkable and shareable.
 * The URL is the single source of truth — there is no duplicate local copy.
 */
export default function usePrFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const result = { scope: searchParams.get('scope') || 'all' };
    ARRAY_KEYS.forEach((key) => {
      result[key] = searchParams.getAll(key);
    });
    SCALAR_KEYS.forEach((key) => {
      if (key !== 'scope') result[key] = searchParams.get(key) || '';
    });
    return result;
  }, [searchParams]);

  const setFilter = useCallback(
    (key, value) => {
      const next = new URLSearchParams(searchParams);
      next.delete(key);
      if (Array.isArray(value)) {
        value.forEach((v) => next.append(key, v));
      } else if (value !== '' && value != null) {
        next.set(key, value);
      }
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams]
  );

  const toggleArrayValue = useCallback(
    (key, value) => {
      const current = searchParams.getAll(key);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      setFilter(key, next);
    },
    [searchParams, setFilter]
  );

  const clearAll = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [setSearchParams]);

  const queryString = searchParams.toString();

  return { filters, setFilter, toggleArrayValue, clearAll, queryString };
}
```

- [ ] **Step 2: Write the page shell**

Create `client/src/pages/PullRequestsPage.jsx`. Sections are placeholders in this task and get filled in by Tasks 10–13; the data fetching and the auto-refresh policy are complete here.

```jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import usePrFilters from '../hooks/usePrFilters';

const STALE_SYNC_MS = 30 * 60 * 1000;

export default function PullRequestsPage() {
  const { filters, setFilter, toggleArrayValue, clearAll, queryString } = usePrFilters();
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const autoSyncedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = queryString ? `?${queryString}` : '';
      const [list, summary, bySprint, byRepo, byAuthor, filterOptions] = await Promise.all([
        api.get(`/pull-requests${qs}`),
        api.get(`/pull-requests/summary${qs}`),
        api.get(`/pull-requests/by-sprint${qs}`),
        api.get(`/pull-requests/by-repo${qs}`),
        api.get(`/pull-requests/by-author${qs}`),
        api.get('/pull-requests/filters'),
      ]);
      setData({ list, summary, bySprint, byRepo, byAuthor });
      setOptions(filterOptions);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      await api.post('/settings/github/sync');
      await load();
    } catch {
      // A failed sync leaves cached data on screen; the repo table shows why.
    } finally {
      setSyncing(false);
    }
  }, [load]);

  // Background refresh when data is stale. Renders cached data first, never blocks.
  useEffect(() => {
    if (!options || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    const last = options.lastSyncAt ? new Date(`${options.lastSyncAt}Z`).getTime() : 0;
    if (Date.now() - last > STALE_SYNC_MS) runSync();
  }, [options, runSync]);

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">Pull Requests</h1>
        <p className="text-red-600">Failed to load pull requests: {error.message}</p>
      </div>
    );
  }

  if (!options) {
    return <div className="p-6 text-gray-500">Loading pull requests…</div>;
  }

  if (!options.repos.length) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">Pull Requests</h1>
        <p className="text-gray-500">
          No repositories are tracked yet. Add some in{' '}
          <a className="text-blue-600 hover:underline" href="/settings/github">
            Settings → GitHub
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pull Requests</h1>
        {loading && <span className="text-sm text-gray-400">Refreshing…</span>}
      </div>

      {/* Task 10 renders PrFilterBar here */}
      {/* Task 11 renders PrReadinessPanel / PrSprintComparison here */}
      {/* Task 12 renders PrRepoTable and PrContributorTable here */}
      {/* Task 13 renders PrTrendChart and PrTable here */}

      <pre className="text-xs bg-gray-50 p-3 rounded border overflow-auto">
        {JSON.stringify({ filters, syncing, counts: data && data.summary }, null, 2)}
      </pre>
    </div>
  );
}
```

The `setFilter`, `toggleArrayValue`, and `clearAll` values are destructured here because Task 10 passes them straight to `PrFilterBar`.

- [ ] **Step 3: Add the route in `client/src/App.jsx`**

Add the import beside the other page imports:

```jsx
import PullRequestsPage from './pages/PullRequestsPage';
```

Add the route after the `/sprints` route:

```jsx
          <Route path="/pull-requests" element={<PullRequestsPage />} />
```

- [ ] **Step 4: Add the sidebar entry in `client/src/components/Layout.jsx`**

Add `GitPullRequest` to the existing `lucide-react` import, then add to `navItems` after the Sprints entry:

```jsx
  { to: '/pull-requests', label: 'Pull Requests', icon: GitPullRequest },
```

- [ ] **Step 5: Verify the page loads and the URL round-trips**

Run `npm run dev` from the repo root, open `http://localhost:5173/pull-requests`.

Expected: the page renders with the debug `<pre>` showing `"scope": "all"` and non-zero counts from the seed. Then open `http://localhost:5173/pull-requests?scope=sprint&sprint=Sprint%201&state=open` — expected: the `<pre>` shows the sprint and state filters applied and lower counts. Reload the page — the same view persists.

- [ ] **Step 6: Commit**

```bash
git add client/src/hooks/usePrFilters.js client/src/pages/PullRequestsPage.jsx client/src/App.jsx client/src/components/Layout.jsx
git commit -m "feat: add pull requests page shell with URL-backed filters"
```

---

### Task 10: Filter bar

**Files:**
- Create: `client/src/components/pr/PrFilterBar.jsx`
- Modify: `client/src/pages/PullRequestsPage.jsx`

**Interfaces:**
- Consumes: `usePrFilters` values (Task 9), `/pull-requests/filters` response.
- Produces: `<PrFilterBar filters options onSetFilter onToggle onClear onSync syncing lastSyncAt />`

- [ ] **Step 1: Write the component**

Create `client/src/components/pr/PrFilterBar.jsx`:

```jsx
import { RefreshCw } from 'lucide-react';

const SCOPES = [
  { value: 'sprint', label: 'Sprint' },
  { value: 'release', label: 'Release' },
  { value: 'range', label: 'Date range' },
  { value: 'all', label: 'All time' },
];

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
      }`}
    >
      {children}
    </button>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export default function PrFilterBar({
  filters, options, onSetFilter, onToggle, onClear, onSync, syncing, lastSyncAt,
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-white">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-gray-400">Scope</span>
        <div className="inline-flex rounded border border-gray-300 overflow-hidden">
          {SCOPES.map((scope) => (
            <button
              key={scope.value}
              type="button"
              onClick={() => onSetFilter('scope', scope.value)}
              className={`px-3 py-1 text-xs border-r border-gray-300 last:border-r-0 ${
                filters.scope === scope.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {scope.label}
            </button>
          ))}
        </div>

        {filters.scope === 'sprint' &&
          options.sprints.map((sprint) => (
            <Chip
              key={sprint}
              active={filters.sprint.includes(sprint)}
              onClick={() => onToggle('sprint', sprint)}
            >
              {sprint}
            </Chip>
          ))}

        {filters.scope === 'release' && (
          <Select
            value={filters.release}
            onChange={(v) => onSetFilter('release', v)}
            options={options.releases.map((r) => ({ value: r, label: r }))}
            placeholder="Pick a release…"
          />
        )}

        {filters.scope === 'range' && (
          <span className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="date"
              value={filters.from}
              onChange={(e) => onSetFilter('from', e.target.value)}
              className="border border-gray-300 rounded px-2 py-1"
            />
            <span>to</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => onSetFilter('to', e.target.value)}
              className="border border-gray-300 rounded px-2 py-1"
            />
          </span>
        )}

        <span className="ml-auto flex items-center gap-2 text-[11px] text-gray-400">
          {lastSyncAt ? `Synced ${lastSyncAt}` : 'Never synced'}
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex items-center gap-1 text-blue-600 hover:underline disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-gray-400">Filters</span>

        <Select
          value={filters.repo[0] || ''}
          onChange={(v) => onSetFilter('repo', v ? [v] : [])}
          options={options.repos.map((r) => ({ value: String(r.id), label: r.slug }))}
          placeholder="All repos"
        />
        <Select
          value={filters.author[0] || ''}
          onChange={(v) => onSetFilter('author', v ? [v] : [])}
          options={options.authors.map((a) => ({ value: String(a.id), label: a.name }))}
          placeholder="All authors"
        />
        <Select
          value={filters.state}
          onChange={(v) => onSetFilter('state', v)}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'merged', label: 'Merged' },
            { value: 'closed', label: 'Closed' },
          ]}
          placeholder="Any state"
        />
        <Select
          value={filters.project}
          onChange={(v) => onSetFilter('project', v)}
          options={options.projects.map((p) => ({ value: String(p.id), label: p.name }))}
          placeholder="All projects"
        />
        <Select
          value={filters.reviewer}
          onChange={(v) => onSetFilter('reviewer', v)}
          options={options.authors.map((a) => ({ value: String(a.id), label: a.name }))}
          placeholder="Any reviewer"
        />

        <button
          type="button"
          onClick={onClear}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it in `PullRequestsPage.jsx`**

Add the import:

```jsx
import PrFilterBar from '../components/pr/PrFilterBar';
```

Replace the `{/* Task 10 renders PrFilterBar here */}` comment with:

```jsx
      <PrFilterBar
        filters={filters}
        options={options}
        onSetFilter={setFilter}
        onToggle={toggleArrayValue}
        onClear={clearAll}
        onSync={runSync}
        syncing={syncing}
        lastSyncAt={options.lastSyncAt}
      />
```

- [ ] **Step 3: Verify filtering works end to end**

Open `http://localhost:5173/pull-requests`. Click "Sprint", then a sprint chip.

Expected: the URL gains `?scope=sprint&sprint=...`, the debug `<pre>` counts drop to that sprint's PRs, and clicking the chip again removes it from the URL. Setting "State: Open" changes counts to open-only. "Clear all" empties the query string and restores the full counts.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/pr/PrFilterBar.jsx client/src/pages/PullRequestsPage.jsx
git commit -m "feat: add PR dashboard filter bar"
```

---

### Task 11: Readiness panel and sprint comparison

**Files:**
- Create: `client/src/components/pr/PrReadinessPanel.jsx`
- Create: `client/src/components/pr/PrSprintComparison.jsx`
- Modify: `client/src/pages/PullRequestsPage.jsx`

**Interfaces:**
- Consumes: `/pull-requests/summary` and `/pull-requests/by-sprint` responses (Task 7).
- Produces: `<PrReadinessPanel summary scopeLabel />`, `<PrSprintComparison rows />`.

- [ ] **Step 1: Write the readiness panel**

Create `client/src/components/pr/PrReadinessPanel.jsx`:

```jsx
export default function PrReadinessPanel({ summary, scopeLabel }) {
  const { merged, open, stale, total, storiesWithoutMergedPr } = summary;
  const pct = (n) => (total ? `${(n / total) * 100}%` : '0%');

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        Readiness — {scopeLabel}
      </div>

      {total === 0 ? (
        <p className="text-sm text-gray-500">No pull requests in this scope.</p>
      ) : (
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="flex h-4 rounded overflow-hidden">
              <div className="bg-green-600" style={{ width: pct(merged) }} />
              <div className="bg-amber-500" style={{ width: pct(open - stale) }} />
              <div className="bg-red-600" style={{ width: pct(stale) }} />
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              {merged} merged · {open} open · {stale} stale &gt;3d without review
            </div>
          </div>

          <div className="text-xs">
            {storiesWithoutMergedPr.length === 0 ? (
              <span className="text-green-700 font-medium">
                Every story has a merged PR
              </span>
            ) : (
              <>
                <div className="text-amber-700 font-semibold">
                  {storiesWithoutMergedPr.length}{' '}
                  {storiesWithoutMergedPr.length === 1 ? 'story has' : 'stories have'} no merged PR
                </div>
                <div className="text-gray-500">
                  {storiesWithoutMergedPr.slice(0, 8).map((s) => s.key).join(', ')}
                  {storiesWithoutMergedPr.length > 8 &&
                    ` +${storiesWithoutMergedPr.length - 8} more`}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the sprint comparison**

Create `client/src/components/pr/PrSprintComparison.jsx`:

```jsx
export default function PrSprintComparison({ rows }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        Sprint comparison
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          No sprint-attributed pull requests in this scope.
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
              <th className="text-left py-1 px-2">Sprint</th>
              <th className="text-left py-1 px-2">Merged</th>
              <th className="text-left py-1 px-2">Open</th>
              <th className="text-left py-1 px-2">Stale</th>
              <th className="text-left py-1 px-2">Median merge</th>
              <th className="text-left py-1 px-2">Mix</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const total = row.merged + row.open || 1;
              return (
                <tr key={row.sprint} className="border-b border-gray-100">
                  <td className="py-1.5 px-2 font-medium">{row.sprint}</td>
                  <td className="py-1.5 px-2">{row.merged}</td>
                  <td className="py-1.5 px-2">{row.open}</td>
                  <td className={`py-1.5 px-2 ${row.stale ? 'text-amber-700 font-semibold' : ''}`}>
                    {row.stale}
                  </td>
                  <td className="py-1.5 px-2">
                    {row.median_merge_days === null ? '—' : `${row.median_merge_days}d`}
                  </td>
                  <td className="py-1.5 px-2">
                    <div className="flex h-3 w-28 rounded overflow-hidden">
                      <div className="bg-green-600" style={{ width: `${(row.merged / total) * 100}%` }} />
                      <div className="bg-amber-500" style={{ width: `${(row.open / total) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render the correct one by scope in `PullRequestsPage.jsx`**

Add the imports:

```jsx
import PrReadinessPanel from '../components/pr/PrReadinessPanel';
import PrSprintComparison from '../components/pr/PrSprintComparison';
```

Replace the `{/* Task 11 ... */}` comment with:

```jsx
      {data && (data.summary.isSingle ? (
        <PrReadinessPanel
          summary={data.summary}
          scopeLabel={filters.scope === 'release' ? `Release ${filters.release}` : filters.sprint[0]}
        />
      ) : (
        <PrSprintComparison rows={data.bySprint} />
      ))}
```

`isSingle` comes from the server so the client never re-derives the rule.

- [ ] **Step 4: Verify both modes render**

Open `/pull-requests?scope=sprint&sprint=<a seeded sprint name>`.
Expected: the readiness bar with merged/open/stale counts and the "stories have no merged PR" list.

Open `/pull-requests?scope=all`.
Expected: the sprint comparison table instead, with one row per sprint.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/pr/PrReadinessPanel.jsx client/src/components/pr/PrSprintComparison.jsx client/src/pages/PullRequestsPage.jsx
git commit -m "feat: add readiness panel and sprint comparison"
```

---

### Task 12: Repository and contributor tables

**Files:**
- Create: `client/src/components/pr/PrRepoTable.jsx`
- Create: `client/src/components/pr/PrContributorTable.jsx`
- Modify: `client/src/pages/PullRequestsPage.jsx`

**Interfaces:**
- Consumes: `/pull-requests/by-repo` and `/pull-requests/by-author` responses (Task 7).
- Produces: `<PrRepoTable rows onSelectRepo activeRepoId />`, `<PrContributorTable rows />`.

- [ ] **Step 1: Write the repo table**

Create `client/src/components/pr/PrRepoTable.jsx`:

```jsx
export default function PrRepoTable({ rows, onSelectRepo, activeRepoId }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        Repositories
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
            <th className="text-left py-1 px-2">Repo</th>
            <th className="text-left py-1 px-2">Open</th>
            <th className="text-left py-1 px-2">Merged</th>
            <th className="text-left py-1 px-2">Stale</th>
            <th className="text-left py-1 px-2">Oldest open</th>
            <th className="text-left py-1 px-2">Median merge</th>
            <th className="text-left py-1 px-2">Sync</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const failed = !!row.last_sync_error;
            return (
              <tr
                key={row.id}
                onClick={() => onSelectRepo(row.id)}
                className={`border-b border-gray-100 cursor-pointer ${
                  failed ? 'bg-red-50' : activeRepoId === String(row.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <td className="py-1.5 px-2">
                  <span className="font-medium">{row.slug}</span>
                  <span className="text-gray-400"> · {row.project_name || 'unmapped'}</span>
                </td>
                {/* A repo that failed to sync shows dashes, never zeros — no data
                    is not the same as no PRs, and zeros would read as a quiet week. */}
                <td className="py-1.5 px-2">{failed ? '—' : row.open}</td>
                <td className="py-1.5 px-2">{failed ? '—' : row.merged}</td>
                <td className={`py-1.5 px-2 ${!failed && row.stale ? 'text-amber-700 font-semibold' : ''}`}>
                  {failed ? '—' : row.stale}
                </td>
                <td className="py-1.5 px-2">
                  {failed || row.oldest_open_days === null ? '—' : `${row.oldest_open_days}d`}
                </td>
                <td className="py-1.5 px-2">
                  {failed || row.median_merge_days === null ? '—' : `${row.median_merge_days}d`}
                </td>
                <td className="py-1.5 px-2">
                  {failed ? (
                    <span className="text-red-600 font-semibold" title={row.last_sync_error}>
                      Failed
                    </span>
                  ) : (
                    <span className="text-green-700 font-semibold">OK</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-[10px] text-gray-400 mt-2">
        Counts respect the active filters. Click a row to filter the page to that repo.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Write the contributor table**

Create `client/src/components/pr/PrContributorTable.jsx`:

```jsx
export default function PrContributorTable({ rows }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        Contributors
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No contributors in this scope.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
              <th className="text-left py-1 px-2">Person</th>
              <th className="text-left py-1 px-2">Authored</th>
              <th className="text-left py-1 px-2">Reviews</th>
              <th className="text-left py-1 px-2">Median size</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.member_id || row.name} className="border-b border-gray-100">
                <td className="py-1.5 px-2">
                  {row.name}
                  {/* Unmapped GitHub logins stay visible rather than being dropped. */}
                  {!row.member_id && (
                    <span className="text-gray-400" title="No matching team member — set their GitHub login in Team">
                      {' '}· unmapped
                    </span>
                  )}
                </td>
                <td className="py-1.5 px-2">{row.authored}</td>
                <td className="py-1.5 px-2">{row.reviews_given}</td>
                <td className="py-1.5 px-2">
                  {row.median_size === null ? '—' : `+${row.median_size}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render both in `PullRequestsPage.jsx`**

Add the imports:

```jsx
import PrRepoTable from '../components/pr/PrRepoTable';
import PrContributorTable from '../components/pr/PrContributorTable';
```

Replace the `{/* Task 12 ... */}` comment with:

```jsx
      {data && (
        <>
          <PrRepoTable
            rows={data.byRepo}
            activeRepoId={filters.repo[0] || ''}
            onSelectRepo={(id) =>
              setFilter('repo', filters.repo.includes(String(id)) ? [] : [String(id)])
            }
          />
          <PrContributorTable rows={data.byAuthor} />
        </>
      )}
```

Clicking the active repo again clears the filter, so a row acts as a toggle.

- [ ] **Step 4: Verify both tables and the failed-repo rendering**

Open `/pull-requests?scope=all`.

Expected: the Repositories table lists `acme/api`, `acme/legacy-billing`, `acme/web`. The `legacy-billing` row has a red background, dashes in every count column, and a red "Failed" in the Sync column with the error as its tooltip. Clicking `acme/api` adds `repo=<id>` to the URL and every section's numbers drop to that repo; clicking it again clears it. The Contributors table shows `omar` marked `· unmapped`.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/pr/PrRepoTable.jsx client/src/components/pr/PrContributorTable.jsx client/src/pages/PullRequestsPage.jsx
git commit -m "feat: add repository and contributor tables"
```

---

### Task 13: Trend chart and PR table

**Files:**
- Create: `client/src/components/pr/PrTrendChart.jsx`
- Create: `client/src/components/pr/PrTable.jsx`
- Modify: `client/src/pages/PullRequestsPage.jsx` (also removes the debug `<pre>`)

**Interfaces:**
- Consumes: `/pull-requests/by-sprint` and `/pull-requests` responses (Task 7).
- Produces: `<PrTrendChart rows />`, `<PrTable rows total sort dir onSort />`.

- [ ] **Step 1: Write the trend chart**

Create `client/src/components/pr/PrTrendChart.jsx`. Recharts is already a dependency.

```jsx
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function PrTrendChart({ rows }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        Merged per sprint
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing to chart in this scope.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="merged" fill="#2563eb" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the PR table**

Create `client/src/components/pr/PrTable.jsx`:

```jsx
const COLUMNS = [
  { key: 'number', label: 'PR' },
  { key: null, label: 'Repo' },
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: null, label: 'Story' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'state', label: 'State' },
  { key: 'size', label: 'Size' },
];

function StateCell({ row }) {
  if (row.state === 'merged') return <span className="text-green-700 font-semibold">Merged</span>;
  if (row.state === 'closed') return <span className="text-gray-400">Closed</span>;
  const days = Math.round((Date.now() - new Date(row.pr_created_at).getTime()) / 86400000);
  return (
    <span className={row.is_stale ? 'text-amber-700 font-semibold' : 'text-gray-600'}>
      Open {days}d{row.is_stale ? ' · stale' : ''}
    </span>
  );
}

export default function PrTable({ rows, total, sort, dir, onSort }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        Pull requests
        <span className="normal-case tracking-normal text-gray-400">
          {' '}— {total} result{total === 1 ? '' : 's'}, row opens GitHub
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No pull requests match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
                {COLUMNS.map((col) => (
                  <th
                    key={col.label}
                    onClick={() => col.key && onSort(col.key)}
                    className={`text-left py-1 px-2 ${col.key ? 'cursor-pointer hover:text-gray-600' : ''}`}
                  >
                    {col.label}
                    {sort === col.key && (dir === 'asc' ? ' ▲' : ' ▼')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => window.open(row.url, '_blank', 'noopener')}
                  className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                >
                  <td className="py-1.5 px-2">#{row.number}</td>
                  <td className="py-1.5 px-2 text-gray-500">{row.repo_slug}</td>
                  <td className="py-1.5 px-2">{row.title}</td>
                  <td className="py-1.5 px-2">
                    {row.author_name || row.author_login || '—'}
                  </td>
                  {/* An explicit dash, not a blank — "no Jira key" is information. */}
                  <td className="py-1.5 px-2">
                    {row.jira_key || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-1.5 px-2">
                    {row.sprint || <span className="text-gray-300">—</span>}
                    {row.sprint_source === 'date_window' && (
                      <span className="text-gray-400" title="Attributed by merge date, not a linked story">
                        {' '}(date)
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2"><StateCell row={row} /></td>
                  <td className="py-1.5 px-2 text-gray-500">
                    +{row.additions}/-{row.deletions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render both and wire sorting in `PullRequestsPage.jsx`**

Add the imports:

```jsx
import PrTrendChart from '../components/pr/PrTrendChart';
import PrTable from '../components/pr/PrTable';
```

Replace the `{/* Task 13 ... */}` comment and **delete the debug `<pre>` block entirely**:

```jsx
      {data && (
        <>
          <PrTrendChart rows={data.bySprint} />
          <PrTable
            rows={data.list.rows}
            total={data.list.total}
            sort={sortKey}
            dir={sortDir}
            onSort={(key) => {
              if (key === sortKey) {
                setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
              } else {
                setSortKey(key);
                setSortDir('desc');
              }
            }}
          />
        </>
      )}
```

Add the sort state near the other `useState` calls:

```jsx
  const [sortKey, setSortKey] = useState('created');
  const [sortDir, setSortDir] = useState('desc');
```

Sort is component state rather than URL state — it is a viewing preference, not part of what makes a view worth sharing. Include it in the request by changing the `qs` line inside `load` to:

```jsx
      const params = new URLSearchParams(queryString);
      params.set('sort', sortKey);
      params.set('dir', sortDir);
      const qs = `?${params.toString()}`;
```

and add `sortKey` and `sortDir` to the `useCallback` dependency array: `[queryString, sortKey, sortDir]`.

- [ ] **Step 4: Verify the full page**

Open `/pull-requests?scope=all`.

Expected: all six sections render with no debug `<pre>`. The trend chart shows a bar per sprint. The PR table lists the 4 seeded PRs; `#404` shows a grey `—` in the Story column and `(date)` beside its sprint; the stale open PR shows `Open 11d · stale` in amber. Clicking the "Size" header re-sorts and the arrow flips on a second click. Clicking a row opens GitHub in a new tab.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/pr/PrTrendChart.jsx client/src/components/pr/PrTable.jsx client/src/pages/PullRequestsPage.jsx
git commit -m "feat: add PR trend chart and PR table"
```

---

### Task 14: GitHub settings page

**Files:**
- Create: `client/src/pages/GitHubSettingsPage.jsx`
- Modify: `client/src/components/SettingsTabs.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/pages/TeamMemberPage.jsx`

**Interfaces:**
- Consumes: the Task 6 settings endpoints.
- Produces: route `/settings/github`; a `github_login` field on the team member form.

- [ ] **Step 1: Write the settings page**

Create `client/src/pages/GitHubSettingsPage.jsx`:

```jsx
import { useEffect, useState } from 'react';
import api from '../lib/api';
import SettingsTabs from '../components/SettingsTabs';

export default function GitHubSettingsPage() {
  const [form, setForm] = useState({ base_url: 'https://api.github.com', pat_token: '', sync_days_back: 180 });
  const [repos, setRepos] = useState([]);
  const [projects, setProjects] = useState([]);
  const [newRepo, setNewRepo] = useState({ owner: '', name: '' });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [settings, repoList, projectList] = await Promise.all([
      api.get('/settings/github'),
      api.get('/settings/github/repos'),
      api.get('/projects'),
    ]);
    if (settings) setForm(settings);
    setRepos(repoList);
    setProjects(projectList);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    try {
      await api.put('/settings/github', form);
      setStatus({ ok: true, message: 'Saved' });
      await load();
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const result = await api.post('/settings/github/test');
      setStatus({ ok: true, message: `Connected as ${result.login}` });
    } catch (err) {
      setStatus({ ok: false, message: (err.data && err.data.error) || err.message });
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    try {
      const result = await api.post('/settings/github/sync');
      setStatus({
        ok: result.failed.length === 0,
        message: `${result.counts.succeeded} of ${result.counts.repos} repos synced, ${result.counts.prs} PRs${
          result.failed.length ? ` — failed: ${result.failed.map((f) => f.repo).join(', ')}` : ''
        }`,
      });
      await load();
    } catch (err) {
      setStatus({ ok: false, message: (err.data && err.data.error) || err.message });
    } finally {
      setBusy(false);
    }
  }

  async function addRepo() {
    if (!newRepo.owner || !newRepo.name) return;
    try {
      await api.post('/settings/github/repos', newRepo);
      setNewRepo({ owner: '', name: '' });
      await load();
    } catch (err) {
      setStatus({ ok: false, message: (err.data && err.data.error) || err.message });
    }
  }

  async function removeRepo(id) {
    await api.del(`/settings/github/repos/${id}`);
    await load();
  }

  async function setRepoProject(repo, projectId) {
    await api.put(`/settings/github/repos/${repo.id}`, {
      label: repo.label,
      project_id: projectId ? Number(projectId) : null,
      is_active: repo.is_active,
    });
    await load();
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>
      <SettingsTabs />

      <div className="max-w-2xl space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Connection</h2>

          <label className="block">
            <span className="text-xs text-gray-500">API base URL</span>
            <input
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              placeholder="https://api.github.com"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <span className="text-[11px] text-gray-400">
              GitHub Enterprise uses https://your-host/api
            </span>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500">Personal access token</span>
            <input
              type="password"
              value={form.pat_token}
              onChange={(e) => setForm({ ...form, pat_token: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <span className="text-[11px] text-gray-400">
              Needs the `repo` scope. Leave the masked value untouched to keep the current token.
            </span>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500">History window (days)</span>
            <input
              type="number"
              value={form.sync_days_back}
              onChange={(e) => setForm({ ...form, sync_days_back: Number(e.target.value) })}
              className="w-32 border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </label>

          <div className="flex gap-2">
            <button onClick={save} disabled={busy}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-50">Save</button>
            <button onClick={test} disabled={busy}
              className="px-3 py-2 text-sm border border-gray-300 rounded disabled:opacity-50">Test connection</button>
            <button onClick={sync} disabled={busy}
              className="px-3 py-2 text-sm border border-gray-300 rounded disabled:opacity-50">Sync now</button>
          </div>

          {status && (
            <p className={`text-sm ${status.ok ? 'text-green-700' : 'text-red-600'}`}>
              {status.message}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Tracked repositories</h2>

          <div className="flex gap-2">
            <input
              value={newRepo.owner}
              onChange={(e) => setNewRepo({ ...newRepo, owner: e.target.value })}
              placeholder="owner"
              className="border border-gray-300 rounded px-3 py-2 text-sm w-40"
            />
            <input
              value={newRepo.name}
              onChange={(e) => setNewRepo({ ...newRepo, name: e.target.value })}
              placeholder="repo"
              className="border border-gray-300 rounded px-3 py-2 text-sm w-48"
            />
            <button onClick={addRepo}
              className="px-3 py-2 text-sm border border-gray-300 rounded">Add</button>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
                <th className="text-left py-1 px-2">Repo</th>
                <th className="text-left py-1 px-2">Project</th>
                <th className="text-left py-1 px-2">Last sync</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {repos.map((repo) => (
                <tr key={repo.id} className="border-b border-gray-100">
                  <td className="py-1.5 px-2">{repo.owner}/{repo.name}</td>
                  <td className="py-1.5 px-2">
                    <select
                      value={repo.project_id || ''}
                      onChange={(e) => setRepoProject(repo, e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="">Unmapped</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 px-2">
                    {repo.last_sync_error ? (
                      <span className="text-red-600" title={repo.last_sync_error}>Failed</span>
                    ) : (
                      <span className="text-gray-500">{repo.last_sync_at || 'never'}</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <button onClick={() => removeRepo(repo.id)}
                      className="text-red-600 hover:underline">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the tab in `client/src/components/SettingsTabs.jsx`**

Change `SETTINGS_TABS` to:

```jsx
const SETTINGS_TABS = [
  { to: '/settings', label: 'General', end: true },
  { to: '/settings/github', label: 'GitHub' },
  { to: '/settings/import-export', label: 'Import & Export' },
  { to: '/settings/about', label: 'About' },
];
```

- [ ] **Step 3: Add the route in `client/src/App.jsx`**

Add the import and the route beside the other settings routes:

```jsx
import GitHubSettingsPage from './pages/GitHubSettingsPage';
```

```jsx
          <Route path="/settings/github" element={<GitHubSettingsPage />} />
```

- [ ] **Step 4: Add the `github_login` field to `client/src/pages/TeamMemberPage.jsx`**

Find the member edit form's email input. Add directly after it, matching the surrounding input's classes:

```jsx
          <label className="block">
            <span className="text-xs text-gray-500">GitHub login</span>
            <input
              value={form.github_login || ''}
              onChange={(e) => setForm({ ...form, github_login: e.target.value })}
              placeholder="octocat"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <span className="text-[11px] text-gray-400">
              Links this person to their pull requests and reviews.
            </span>
          </label>
```

Then confirm the member update handler in `server/routes/team.js` persists `github_login`. If its UPDATE statement lists columns explicitly, add `github_login = ?` and pass `req.body.github_login || null` in the matching position.

- [ ] **Step 5: Verify the settings flow**

Open `http://localhost:5173/settings/github`.

Expected: the GitHub tab is present and active; the form shows the seeded base URL with a masked token; adding a repo (`owner`/`repo`) makes it appear in the table; setting its project persists across a reload; Remove deletes it. On a team member page, entering a GitHub login and saving persists across a reload.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/GitHubSettingsPage.jsx client/src/components/SettingsTabs.jsx client/src/App.jsx client/src/pages/TeamMemberPage.jsx server/routes/team.js
git commit -m "feat: add github settings page and team member github login"
```

---

### Task 15: End-to-end verification

**Files:**
- Modify: `CLAUDE.md` (document the test command)

**Interfaces:**
- Consumes: everything.

- [ ] **Step 1: Run the unit tests**

Run: `cd server && npm test`
Expected: `# fail 0`, 27 tests across `prResolve.test.js` and `prFilters.test.js`.

- [ ] **Step 2: Verify sync idempotency**

With real GitHub credentials configured, sync twice and confirm the PR count is unchanged:

```bash
curl -s -X POST localhost:3001/api/settings/github/sync > /dev/null
curl -s "localhost:3001/api/pull-requests?scope=all&limit=1" | head -c 120; echo
curl -s -X POST localhost:3001/api/settings/github/sync > /dev/null
curl -s "localhost:3001/api/pull-requests?scope=all&limit=1" | head -c 120; echo
```

Expected: the `"total"` value is identical in both responses. If credentials are not available, re-run `npm run seed` instead and confirm the seed's counts match Task 8 Step 3.

- [ ] **Step 3: Verify filter consistency across sections**

Open `/pull-requests?scope=all`, note the Repositories table's merged count for `acme/api`. Then click that repo row.

Expected: the readiness/comparison totals, the Contributors table, the trend chart, and the PR table all drop to that repo's numbers, and the PR table's total matches the repo row's open + merged.

- [ ] **Step 4: Verify URL round-trip**

Apply several filters, copy the URL, open it in a new tab.

Expected: an identical view, including scope, chips, and select values.

- [ ] **Step 5: Verify the production build compiles**

Run: `npm run build` from the repo root.
Expected: Vite build succeeds with no errors.

- [ ] **Step 6: Document the test command in `CLAUDE.md`**

In the Commands block, replace the line `No test framework is configured. No linter is configured.` with:

```markdown
# Run server unit tests (Node's built-in runner, no dependencies)
cd server && npm test
```

and below the block:

```markdown
Server unit tests cover the pure logic in `server/services/` (`prResolve.js`,
`prFilters.js`) using Node's built-in `node --test` runner. There is no client
test framework and no linter.
```

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document server unit test command"
```

---

## Self-Review

**Spec coverage:** Data model → Task 1. Sync (GraphQL, resolution, failure handling, refresh policy) → Tasks 2, 4, 5, and the auto-refresh in Task 9. API (all six endpoints + shared filter helper) → Tasks 3, 6, 7. Page (six sections, URL filters, both scope modes) → Tasks 9–13. Settings UI + `github_login` → Task 14. Error handling → Task 6 (401/403), Task 5 (per-repo isolation), Task 9 (empty state, fetch failure), Task 12 (failed-repo rendering). Testing → Tasks 2, 3, 8, 15. No spec section is unimplemented.

**Type consistency:** `buildPrFilter` returns `{ where, params, scope }` in Task 3 and is destructured that way in Tasks 6 and 7. `scope.isSingle` is produced in Task 3, returned by `/summary` in Task 7, and consumed in Task 11. `sprint_source` is written as `'date_window'` in Task 2 and matched against that exact string in Task 13. `median_merge_days` and `oldest_open_days` are named identically in Tasks 7 and 12. `usePrFilters` returns the five values destructured in Task 9 and passed through in Task 10.

**Deviation from the spec, flagged for the reviewer:** the spec says verification is manual and no test framework is introduced. This plan test-drives `prResolve.js` and `prFilters.js` with Node 22's built-in `node --test`, which adds **no dependency** — only a `"test": "node --test"` script. Those two modules hold the sprint-attribution and SQL-filter logic, where a silent error would corrupt every number on the page without ever throwing. Everything else stays manual, exactly as the spec describes. If you would rather hold the spec literally, drop Task 2 Steps 1–3 and Task 3 Steps 1–2 and keep the implementations.
