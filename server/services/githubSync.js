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

/**
 * Load the set of real Jira project-key prefixes (the substring of
 * stories.key before its '-') so parseJiraKey can reject lookalike tokens
 * like UTF-8 or SHA-256 instead of guessing. Loaded once per sync run.
 */
function loadKnownPrefixes() {
  const rows = db.prepare('SELECT DISTINCT key FROM stories').all();
  const prefixes = new Set();
  rows.forEach((r) => {
    const key = r.key;
    if (!key) return;
    const idx = key.lastIndexOf('-');
    if (idx > 0) prefixes.add(key.slice(0, idx));
  });
  return prefixes;
}

/**
 * Build a `key IN (...)` placeholder list and its bound params without ever
 * interpolating values into the SQL text. Dedupes and drops falsy keys.
 */
function inClauseParams(keys) {
  const unique = Array.from(new Set((keys || []).filter(Boolean)));
  return { placeholders: unique.map(() => '?').join(','), params: unique };
}

/**
 * Look up stories for a whole page of PRs in one query instead of one query
 * per PR (sql.js re-prepares SQL text on every db.prepare() call, so at
 * ~3,000-PR scale a per-PR lookup is thousands of avoidable prepares).
 */
function loadStoriesByKeys(keys) {
  const { placeholders, params } = inClauseParams(keys);
  const map = new Map();
  if (!placeholders) return map;
  const rows = db
    .prepare(`SELECT id, sprint, key FROM stories WHERE key IN (${placeholders})`)
    .all(...params);
  rows.forEach((r) => map.set(r.key, { id: r.id, sprint: r.sprint }));
  return map;
}

/** Flatten one GraphQL PR node into the row shape plus its reviews. */
function mapNode(node, { repoId, plans, memberMap, knownPrefixes, storyMap }) {
  const authorLogin = node.author ? node.author.login : null;
  const reviews = (node.reviews && node.reviews.nodes ? node.reviews.nodes : [])
    .filter((rv) => rv && rv.submittedAt)
    .map((rv) => ({
      author_login: rv.author ? rv.author.login : null,
      submitted_at: rv.submittedAt,
      state: REVIEW_STATE_MAP[rv.state] || 'commented',
    }));

  const jiraKey = parseJiraKey(node.title, node.headRefName, knownPrefixes);
  const story = jiraKey ? (storyMap && storyMap.get(jiraKey)) || null : null;

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

/**
 * True if a PR's updatedAt is after the cutoff. Both arguments MUST be
 * ISO-8601 UTC timestamps with a 'T' separator and 'Z' suffix (e.g.
 * "2026-08-17T09:00:00Z") for this string comparison to be a valid stand-in
 * for chronological comparison. github_settings.last_sync_at and
 * github_repos.last_sync_at are written in exactly this format via
 * strftime('%Y-%m-%dT%H:%M:%SZ','now') for this reason — do not switch
 * either column back to datetime('now') (space separator, no 'Z'), which
 * silently breaks same-day incremental syncs (see githubSync.test.js).
 */
function isFresh(updatedAt, cutoff) {
  return updatedAt > cutoff;
}

/** Walk a repo's PRs newest-first, stopping once updatedAt predates the cutoff. */
async function syncRepo(settings, repo, cutoff, plans, memberMap, knownPrefixes) {
  let cursor = null;
  let count = 0;

  for (;;) {
    const page = await fetchPullRequestPage(settings, {
      owner: repo.owner,
      name: repo.name,
      cursor,
    });

    const fresh = page.nodes.filter((n) => isFresh(n.updatedAt, cutoff));
    const storyMap = loadStoriesByKeys(
      fresh.map((n) => parseJiraKey(n.title, n.headRefName, knownPrefixes))
    );
    const mapped = fresh.map((n) =>
      mapNode(n, { repoId: repo.id, plans, memberMap, knownPrefixes, storyMap })
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
  const knownPrefixes = loadKnownPrefixes();

  const synced = [];
  const failed = [];
  let abortError = null;

  for (const repo of repos) {
    const slug = `${repo.owner}/${repo.name}`;
    try {
      const prs = await syncRepo(settings, repo, cutoff, plans, memberMap, knownPrefixes);
      db.prepare(
        "UPDATE github_repos SET last_sync_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), last_sync_error = NULL WHERE id = ?"
      ).run(repo.id);
      synced.push({ repo: slug, prs });
    } catch (err) {
      if (err.status === 401) {
        // Bad token: stop syncing further repos, but let the trailing
        // last_sync_at advance below still run for repos that already
        // succeeded, then rethrow so the caller still sees the 401.
        abortError = err;
        break;
      }
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
      "UPDATE github_settings SET last_sync_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), updated_at = datetime('now') WHERE id = 'default'"
    ).run();
  }

  if (abortError) throw abortError;

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

module.exports = { syncAll, mapNode, isFresh, inClauseParams, loadStoriesByKeys };
