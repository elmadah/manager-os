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
  const nums = values
    .filter((v) => v !== null && v !== undefined && Number.isFinite(v))
    .sort((a, b) => a - b);
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
  // SORTABLE is a plain object, so `SORTABLE[req.query.sort]` also resolves
  // inherited properties (constructor, __proto__, hasOwnProperty, toString,
  // valueOf), which are truthy and would defeat the `||` fallback below.
  // Require sort to be a genuine own key of the allow-list.
  const sortCol = Object.prototype.hasOwnProperty.call(SORTABLE, req.query.sort)
    ? SORTABLE[req.query.sort]
    : 'pr.pr_created_at';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  // Clamp both bounds: a negative or zero limit (e.g. ?limit=-1) must not
  // sail through to SQL as `LIMIT -1`, which SQLite treats as "no limit".
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 1000) : 200;
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
       ${where} AND r.is_active = 1
       ORDER BY ${sortCol} ${dir}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const total = db
    .prepare(
      `SELECT COUNT(*) AS n FROM pull_requests pr
       JOIN github_repos r ON r.id = pr.repo_id ${where} AND r.is_active = 1`
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
       JOIN github_repos r ON r.id = pr.repo_id ${where} AND r.is_active = 1`
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

// `trend` is an opt-in trailing-window mode for the "Merged per sprint"
// chart: when present (a positive integer count of sprints), the SPRINT/
// RELEASE/DATE-RANGE scope is ignored so neighbouring sprints can appear —
// this is what lets the chart show trailing context even when the user has
// drilled into a single sprint — while every other filter (repo, author,
// state, project, reviewer) still applies via buildPrFilter as normal.
// Without `trend`, behavior is unchanged: the endpoint stays scope-respecting
// for the sprint-comparison table.
const MAX_TREND_SPRINTS = 52;

router.get('/by-sprint', (req, res) => {
  const trendCount = Number(req.query.trend);
  const useTrend = Number.isInteger(trendCount) && trendCount > 0;
  const trendLimit = useTrend ? Math.min(trendCount, MAX_TREND_SPRINTS) : null;

  const { where, params } = buildPrFilter(req.query, { ignoreScopeFilter: useTrend });

  const rows = db
    .prepare(
      `SELECT pr.sprint, pr.state, pr.merged_at, pr.pr_created_at,
              ${STALE_SQL} AS is_stale
       FROM pull_requests pr
       JOIN github_repos r ON r.id = pr.repo_id
       ${where} AND r.is_active = 1 AND pr.sprint IS NOT NULL`
    )
    .all(...params);

  const bySprint = new Map();
  rows.forEach((row) => {
    if (!bySprint.has(row.sprint)) {
      bySprint.set(row.sprint, { sprint: row.sprint, merged: 0, open: 0, closed: 0, stale: 0, days: [] });
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
    if (row.state === 'closed') entry.closed += 1;
    if (row.is_stale) entry.stale += 1;
  });

  let result = [...bySprint.values()]
    .map(({ days, ...rest }) => ({ ...rest, median_merge_days: round1(median(days)) }))
    .sort((a, b) => a.sprint.localeCompare(b.sprint, undefined, { numeric: true }));

  // Most recent N sprints by the existing sprint ordering, kept
  // oldest-to-newest so the chart reads left to right.
  if (useTrend) {
    result = result.slice(-trendLimit);
  }

  res.json(result);
});

// --- Per-repo breakdown ----------------------------------------------------

router.get('/by-repo', (req, res) => {
  // The Repositories table doubles as the repo selector: clicking a row
  // filters the whole dashboard to that repo. If /by-repo applied its own
  // `repo` filter to its own rows, every other repo would drop to 0/0 the
  // moment one was selected, making the table useless for navigating to a
  // different repo. A facet must not filter itself, so `repo` is excluded
  // here via buildPrFilter's ignoreRepoFilter option — every other filter
  // (scope, author, state, project, reviewer) still applies normally.
  const { prClauses, prParams, repoClauses, repoParams } = buildPrFilter(
    req.query,
    { ignoreRepoFilter: true }
  );

  // /by-repo must LEFT JOIN from github_repos so a repo with zero matching
  // PRs still returns a row (that is how a failed-sync repo becomes visible
  // in the UI at all). A condition on `r.` (github_repos) placed in the
  // LEFT JOIN's ON clause does not remove the driving row — it only stops
  // pull_requests from joining — so a repo-level filter (e.g. project) must
  // sit in the outer WHERE alongside `r.is_active = 1`, while pr-level
  // filters (sprint, author, state, reviewer — repo excluded, see above) go
  // in the ON clause so they narrow which PRs join without dropping repos
  // that have none.
  const joinFilter = prClauses.length ? ` AND ${prClauses.join(' AND ')}` : '';
  const repoFilter = repoClauses.length ? ` AND ${repoClauses.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT r.id, r.owner || '/' || r.name AS slug, r.last_sync_error,
              p.name AS project_name,
              pr.state, pr.merged_at, pr.pr_created_at, ${STALE_SQL} AS is_stale
       FROM github_repos r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN pull_requests pr ON pr.repo_id = r.id${joinFilter}
       WHERE r.is_active = 1${repoFilter}`
    )
    // Placeholders appear in this SQL text in the order: ON-clause
    // (prParams) first, then WHERE-clause (repoParams) second. That is a
    // different order than the combined `params` array from buildPrFilter
    // (which reflects clause-construction order, e.g. scope/repo/author/
    // state before project), so we bind prParams then repoParams here
    // rather than reusing `params` — reusing it would silently bind values
    // to the wrong placeholders.
    .all(...prParams, ...repoParams);

  // Unfiltered per-repo PR counts, entirely independent of buildPrFilter's
  // clauses (no scope/author/state/sprint/release/date-range/project/
  // reviewer filtering, and no repo filter either — this is "does this repo
  // have any PRs at all"). This cannot be produced by the query above: that
  // query's filter conditions live in the LEFT JOIN's ON clause specifically
  // so a repo with zero *matching* PRs still returns a driving row, and
  // folding an unfiltered count into the same joined rows would require
  // either a second, differently-filtered join (not expressible via a
  // single ON clause) or counting post-hoc in JS from already-filtered rows
  // (which would just reproduce the bug). A standalone query keyed by
  // repo_id sidesteps all of that, and — because it takes no parameters —
  // there is no binding-order interaction with prParams/repoParams above.
  const totalsByRepo = new Map(
    db
      .prepare('SELECT repo_id, COUNT(*) AS n FROM pull_requests GROUP BY repo_id')
      .all()
      .map((r) => [r.repo_id, r.n])
  );

  const byRepo = new Map();
  rows.forEach((row) => {
    if (!byRepo.has(row.id)) {
      byRepo.set(row.id, {
        id: row.id,
        slug: row.slug,
        project_name: row.project_name,
        last_sync_error: row.last_sync_error,
        total_prs: totalsByRepo.get(row.id) || 0,
        open: 0, merged: 0, closed: 0, stale: 0, days: [], openAges: [],
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
    if (row.state === 'closed') entry.closed += 1;
    if (row.is_stale) entry.stale += 1;
  });

  res.json(
    [...byRepo.values()]
      .map(({ days, openAges, ...rest }) => {
        const finiteAges = openAges.filter((v) => Number.isFinite(v));
        return {
          ...rest,
          median_merge_days: round1(median(days)),
          oldest_open_days: finiteAges.length ? Math.round(Math.max(...finiteAges)) : null,
        };
      })
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
       ${where} AND r.is_active = 1`
    )
    .all(...params);

  // Note: when a `reviewer` filter is present, buildPrFilter's `where`
  // fragment contains an EXISTS subquery that also aliases pr_reviews as
  // `rv` (see prFilters.js), shadowing this query's outer `pr_reviews rv`.
  // This is intentional and safe: the subquery only correlates on the
  // outer `pr.id`, never on the outer `rv`, so the shadowed alias is never
  // actually referenced from inside the subquery.
  const reviews = db
    .prepare(
      `SELECT rv.reviewer_member_id AS member_id, rv.reviewer_login,
              COUNT(*) AS n
       FROM pr_reviews rv
       JOIN pull_requests pr ON pr.id = rv.pull_request_id
       JOIN github_repos r ON r.id = pr.repo_id
       ${where} AND r.is_active = 1
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
    // A person can review PRs without ever authoring one (an engineering
    // manager, a QA lead) — the reviewer filter must not be limited to
    // people who show up in `authors`, so it gets its own list built from
    // pr_reviews.reviewer_member_id.
    reviewers: db
      .prepare(
        `SELECT DISTINCT tm.id, tm.name FROM team_members tm
         JOIN pr_reviews rv ON rv.reviewer_member_id = tm.id ORDER BY tm.name`
      )
      .all(),
    projects: db.prepare('SELECT id, name FROM projects ORDER BY name').all(),
    lastSyncAt: settings ? settings.last_sync_at : null,
    // Distinguishes "GitHub isn't configured at all" (no github_settings
    // row) from "configured but never synced" (row exists, last_sync_at is
    // null) — the client needs this to avoid firing a background sync that
    // is guaranteed to 400 when GitHub was never set up.
    githubConfigured: !!settings,
  });
});

module.exports = router;
