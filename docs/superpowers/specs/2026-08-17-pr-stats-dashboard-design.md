# PR Stats Dashboard — Design

Date: 2026-08-17
Status: Approved for planning

## Problem

Manager OS tracks stories, sprints, releases, and capacity, but has no view of the
code work behind them. As a manager I cannot answer, without leaving the app:

- For this sprint or release, how many PRs are open versus merged, and which
  stories still have no merged PR?
- Who authored what, and who is doing the reviewing?
- Is PR throughput per sprint going up or down, and which repo is slow?

## Goals

1. **Sprint/release readiness** — a verdict for a single sprint or release.
2. **Per-person contribution** — PRs authored, reviews given, PR size.
3. **Volume and trend** — merged PRs per sprint, per repo, over time.

## Non-goals

- Deep flow-health analytics (review latency distributions, queue modelling).
  Stale-PR and median-merge-time signals are included; anything further is out.
- Writing to GitHub. This is read-only.
- Replacing GitHub's own PR UI. Rows link out to GitHub.
- Commit-level or line-level analysis.

## Scale assumptions

5–15 repositories, ~180 days of history, on the order of a few thousand PRs.
GitHub cloud or GitHub Enterprise Server.

## Approach

Mirror the existing Jira integration: configuration lives in a settings table,
a sync pulls remote data into local tables, and every read is a local SQL query.
This gives fast filtering, real historical trend data, and offline operation
after a sync.

Rejected alternatives:

- **Aggregates only** (store per-sprint rollups, not individual PRs). Too small
  to answer "which PRs are still open for this release", which is the primary job.
- **Live GitHub queries per page view.** Slow, rate-limit-prone, and no history.
- **No new page, just PR badges on existing pages.** No place for cross-repo
  questions and no trend view. Deferred as a follow-on (see Future work).

## Data model

New tables, added to `server/db/schema.sql` with `CREATE TABLE IF NOT EXISTS`.
The `team_members` column addition uses the inline `PRAGMA table_info` migration
pattern already in `server/db/init.js`.

```sql
CREATE TABLE IF NOT EXISTS github_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  base_url TEXT NOT NULL,            -- https://api.github.com or GHES /api
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
  last_sync_error TEXT,             -- NULL when the last sync succeeded
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
  submitted_at TEXT,
  UNIQUE(pull_request_id, reviewer_login, submitted_at)
);

CREATE INDEX IF NOT EXISTS idx_pull_requests_sprint ON pull_requests(sprint);
CREATE INDEX IF NOT EXISTS idx_pull_requests_repo ON pull_requests(repo_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_author ON pull_requests(author_member_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_story ON pull_requests(story_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_merged_at ON pull_requests(merged_at);
CREATE INDEX IF NOT EXISTS idx_pr_reviews_pr ON pr_reviews(pull_request_id);
CREATE INDEX IF NOT EXISTS idx_pr_reviews_member ON pr_reviews(reviewer_member_id);

-- Inline migration in init.js:
ALTER TABLE team_members ADD COLUMN github_login TEXT;
```

### Design decisions

**`sprint` is denormalized onto the PR at sync time**, with `sprint_source`
recording how it was derived. Dashboard queries become `WHERE sprint = ?`
instead of a three-way join with fallback logic, and `sprint_source` keeps the
result honest — the UI can always show which attributions came from a date
guess rather than a real story link.

**`jira_key` is stored separately from `story_id`.** A PR that references a
story not yet imported keeps its key and gets relinked on a later sync, rather
than being silently orphaned.

**Release attribution reuses `stories.release_date` via `story_id`.** No
separate release table; releases are already defined by the stories.

**`author_member_id` may be null.** Unmapped GitHub logins display as the raw
login rather than being dropped, so no PR silently disappears from counts.

**`pr_created_at` rather than `created_at`** for the PR's GitHub creation time,
so the column does not collide with the local row-insert convention used
elsewhere in the schema.

## Sync

`POST /api/settings/github/sync` — synchronous, returns a summary. Reuses the transaction
behaviour in `db/init.js` (writes inside a transaction are not persisted per
statement).

### GraphQL, not REST

The REST list-PRs endpoint omits `additions`, `deletions`, and `changed_files`,
so PR size requires one extra request per PR, and reviews require another. At
~3,000 PRs that is ~6,000 requests against a 5,000/hour rate limit — the sync
would fail. One GraphQL query per page returns PRs with diff stats and review
nodes, 50 at a time: roughly 60 requests for the same data.

```graphql
repository(owner: $owner, name: $name) {
  pullRequests(first: 50, after: $cursor,
               orderBy: {field: UPDATED_AT, direction: DESC}) {
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
```

Pages are walked newest-first and the walk stops as soon as `updatedAt` falls
below the cutoff. The cutoff is `github_settings.last_sync_at`, or
`now - sync_days_back` on the first run. Incremental syncs therefore touch only
what changed.

`state` maps from GitHub's `OPEN`/`MERGED`/`CLOSED` to the local lowercase
enum. A PR with more than 20 reviews has its review list truncated; this
affects only the "reviews given" count and is accepted at this scale.

### Per-PR resolution

Applied in order for every synced PR:

1. `jira_key` — first `[A-Z][A-Z0-9]+-\d+` match in the title; if none, in
   `headRefName`. Title takes precedence because branches get renamed while
   titles are curated.
2. `story_id` — lookup `stories.key = jira_key`. May stay null.
3. `sprint` / `sprint_source`:
   - story's `sprint` → `sprint_source = 'story'`
   - else the `capacity_plans` row whose `start_date`..`end_date` window contains
     `merged_at` (or `pr_created_at` for still-open PRs), using that plan's
     `jira_sprint_name` → `sprint_source = 'date_window'`
   - else null → `sprint_source = 'none'`
   - If windows overlap, the plan with the latest `start_date` wins.
4. `author_member_id` — lookup `team_members.github_login` (case-insensitive).
5. `first_review_at` — minimum `submitted_at` across reviews, excluding reviews
   whose author is the PR author.

Rows are upserted on `(repo_id, number)` so re-syncs are idempotent. Reviews for
a PR are deleted and reinserted on each sync of that PR.

### Failure handling

Each repo syncs inside its own transaction and its own try/catch. A 404
(renamed or deleted repo) or a per-repo 403 is recorded in
`github_repos.last_sync_error` and the sync continues to the next repo. A 401
short-circuits the whole run, since a bad PAT fails for every repo.

Response shape:

```json
{
  "synced": [{ "repo": "org/api", "prs": 58 }],
  "failed": [{ "repo": "org/legacy-billing", "error": "404 Not Found" }],
  "counts": { "repos": 4, "succeeded": 3, "prs": 142 }
}
```

`github_settings.last_sync_at` is advanced only if at least one repo succeeded,
so a total failure does not skip a window of history.

### Refresh policy

The dashboard renders cached data immediately on load, and fires
`POST /api/settings/github/sync` in the background when `last_sync_at` is older than
30 minutes, re-fetching the page data when it returns. The first paint is never
blocked. A manual "Sync now" control in the filter bar triggers the same
endpoint.

## API

All routes mounted in `server/index.js`:

```
app.use('/api/settings/github', githubSettingsRouter);
app.use('/api/pull-requests', pullRequestsRouter);
```

**Settings** (`server/routes/githubSettings.js`), following `jiraSettings.js`:

- `GET  /api/settings/github` — settings with the PAT masked
- `PUT  /api/settings/github` — save base URL, PAT, days back
- `POST /api/settings/github/test` — validate credentials
- `GET/POST/PUT/DELETE /api/settings/github/repos` — manage tracked repos
- `POST /api/settings/github/sync` — trigger a sync; used by both the Settings
  page and the dashboard's manual and background refresh

**Dashboard** (`server/routes/pullRequests.js`). Every endpoint accepts the same
filter query params: `scope` (`sprint`|`release`|`range`|`all`), `sprint`
(repeatable), `release`, `from`, `to`, `repo` (repeatable), `author`
(repeatable), `state`, `project`, `reviewer`.

- `GET /api/pull-requests` — filtered PR list, sortable, paginated
- `GET /api/pull-requests/summary` — readiness for a single scope: merged/open/
  stale counts, plus stories in scope with no merged PR
- `GET /api/pull-requests/by-sprint` — per-sprint comparison rows
- `GET /api/pull-requests/by-repo` — per-repo rows including sync status
- `GET /api/pull-requests/by-author` — per-person authored/reviews/median size
- `GET /api/pull-requests/filters` — distinct sprints, repos, authors, projects
  for populating the filter bar

Filter parsing lives in one shared helper (`server/services/prFilters.js`) that
turns query params into a SQL `WHERE` clause plus bound params, so all six
endpoints filter identically.

**Definitions**, applied consistently across endpoints:

- *stale* — an open, non-draft PR with no `first_review_at` and
  `pr_created_at` older than 3 days.
- *median merge time* — median of `merged_at - pr_created_at` over merged PRs
  in scope.
- *median size* — median of `additions + deletions`.
- *stories with no merged PR* — stories whose `sprint` (or `release_date`, in
  release scope) is in scope and which have no linked PR in state `merged`.
  Includes stories with no PRs at all.

## Page

Route `/pull-requests` in `App.jsx`, page component
`client/src/pages/PullRequestsPage.jsx`, plus a sidebar entry in `Layout.jsx`.
Sections top to bottom:

1. **Filter bar** — a scope segmented control (Sprint / Release / Date range /
   All time) with multi-select chips, then repo, author, state, project, and
   reviewer filters, a "Clear all", and sync status with a "Sync now" action.
   All filter state is serialized to the URL query string so any view is
   bookmarkable and shareable, and is the single source of truth for the page.

2. **Readiness or comparison** — mode depends on scope:
   - *Single sprint or release*: a merged/open/stale bar with counts, and the
     list of stories in scope with no merged PR.
   - *Multi-select, date range, or all time*: a per-sprint comparison table
     (sprint, merged, open, median merge time, mix bar). A readiness percentage
     across six sprints is meaningless, so it is not shown.

3. **Repositories** — per repo: open, merged, stale, oldest open PR age, median
   merge time, mix bar, mapped project, and sync status. Clicking a row filters
   the whole page to that repo. In multi-scope the "oldest open" column is
   replaced by a per-repo trend column. A repo whose last sync failed renders
   as an error row with dashes, never zeros — a repo with no data is not a repo
   with no PRs, and zeros would read as a quiet week.

4. **Contributors** — per person: authored, reviews given, median PR size.
   Unmapped GitHub logins appear as raw logins.

5. **Merged-per-sprint trend** — Recharts bar chart over the sprints in scope
   (last 6 when scope is a single sprint).

6. **PR table** — number, repo, title, author, story key, sprint, state, size.
   Sortable by column, row opens the PR on GitHub in a new tab. PRs attributed
   by date window rather than story link are marked, and PRs with no Jira key
   show an explicit dash rather than a blank.

Sections 3–6 respect the active filters identically in both modes.

### Components

- `PullRequestsPage.jsx` — route component; owns filter state ↔ URL sync and
  data fetching, renders the sections.
- `PrFilterBar.jsx` — scope control and filter chips.
- `PrReadinessPanel.jsx` — single-scope verdict.
- `PrSprintComparison.jsx` — multi-scope comparison table.
- `PrRepoTable.jsx`, `PrContributorTable.jsx`, `PrTrendChart.jsx`,
  `PrTable.jsx` — the remaining sections.
- `usePrFilters.js` — hook encapsulating URL ↔ filter-object serialization,
  so the page component does not carry that logic.

Each presentational component takes plain data props and does no fetching,
so it can be reasoned about and changed independently of the page.

### Settings UI

A new "GitHub" tab in `SettingsTabs.jsx` at `/settings/github`
(`GitHubSettingsPage.jsx`): base URL, PAT, days back, a Test Connection button,
the tracked-repo list with project mapping, and a per-repo last-sync status. The
team-member edit form gains a `github_login` field.

## Error handling

- **No settings configured** — the dashboard renders an empty state pointing to
  Settings → GitHub rather than an error.
- **Partial sync failure** — the page still renders; failed repos surface as
  error rows in the Repositories section and in the sync status line
  ("3 of 4 repos synced").
- **Invalid PAT (401)** — sync aborts, the settings row records the failure, and
  the UI shows a toast linking to Settings.
- **Rate limit (403 with reset header)** — the sync stops early, keeps what it
  already committed, and reports the reset time. Because commits are per repo,
  partial progress is retained.
- **Malformed GraphQL response** — treated as a repo-level failure.
- **Client fetch failure** — existing `ErrorBoundary` and `ToastProvider`
  handle display, as on other pages.

## Testing

No test framework is configured in this repo, and this design does not
introduce one. Verification is manual, against a seeded database:

1. Extend `server/seed.js` with sample repos, PRs, and reviews covering: a PR
   linked to a story, a PR with no Jira key attributed by date window, an open
   stale PR, a PR by an unmapped GitHub login, and a repo with a sync error.
2. Verify each filter combination changes counts consistently across all
   sections, and that the URL round-trips (copy URL, reload, same view).
3. Verify readiness/comparison mode switches with scope.
4. Verify a re-sync is idempotent — PR counts do not change.

If a test framework is added later, `prFilters.js` and the Jira-key/sprint
resolution logic are the units worth covering first; both are pure functions
over inputs and were factored out with that in mind.

## Future work

Deliberately out of scope for this spec:

- PR badges on `SprintsPage`, `TeamMemberPage`, and `ProjectDetailPage`, reusing
  these tables.
- Review-latency distributions and reviewer load balancing.
- Webhook-based real-time sync.
- Including PR state in the weekly digest.
