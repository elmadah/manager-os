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
 * Coerce a query param expected to be a scalar into a non-empty string, or
 * null. Express/qs turns a repeated query param into an array, and arrays
 * (and other objects) are truthy in JS, so without this a repeated `?from=`
 * would sail past a truthy check and get bound to SQL as a non-scalar,
 * which sql.js silently accepts as a BLOB instead of rejecting outright.
 * Anything that isn't a non-empty string — arrays, objects, null,
 * undefined, '' — becomes null so the filter is simply skipped.
 */
function toScalarString(value) {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Turn dashboard query params into a SQL WHERE fragment and bound params.
 * Queries must alias pull_requests as `pr` and github_repos as `r`.
 * Every value is bound, never interpolated.
 */
function buildPrFilter(query = {}, options = {}) {
  const { ignoreRepoFilter = false } = options;
  const clauses = [];
  const params = [];
  // Same clauses/params, but split by which table's row they constrain.
  // pull_requests-level clauses (aliased `pr`) are safe to filter with in a
  // WHERE after an inner JOIN, or in a LEFT JOIN's ON clause. github_repos-
  // level clauses (aliased `r`) must go in the outer WHERE of a query that
  // LEFT JOINs from github_repos, or they'd silently fail to exclude rows
  // (a condition on the "one" side of a LEFT JOIN placed in the ON clause
  // only suppresses the join match, not the driving row).
  const prClauses = [];
  const prParams = [];
  const repoClauses = [];
  const repoParams = [];

  function addPr(clause, ...values) {
    clauses.push(clause);
    params.push(...values);
    prClauses.push(clause);
    prParams.push(...values);
  }

  function addRepo(clause, ...values) {
    clauses.push(clause);
    params.push(...values);
    repoClauses.push(clause);
    repoParams.push(...values);
  }

  const mode = VALID_MODES.includes(query.scope) ? query.scope : 'all';
  const sprints = toArray(query.sprint).filter((v) => typeof v === 'string');
  const release = toScalarString(query.release);
  const from = toScalarString(query.from);
  const to = toScalarString(query.to);

  if (mode === 'sprint' && sprints.length) {
    addPr(`pr.sprint IN (${sprints.map(() => '?').join(', ')})`, ...sprints);
  } else if (mode === 'release' && release) {
    addPr(
      'pr.story_id IN (SELECT id FROM stories WHERE release_date = ?)',
      release
    );
  } else if (mode === 'range' && from && to) {
    addPr('COALESCE(pr.merged_at, pr.pr_created_at) BETWEEN ? AND ?', from, to);
  }

  const repos = toIntArray(query.repo);
  if (repos.length && !ignoreRepoFilter) {
    addPr(`pr.repo_id IN (${repos.map(() => '?').join(', ')})`, ...repos);
  }

  const authors = toIntArray(query.author);
  if (authors.length) {
    addPr(`pr.author_member_id IN (${authors.map(() => '?').join(', ')})`, ...authors);
  }

  if (VALID_STATES.includes(query.state)) {
    addPr('pr.state = ?', query.state);
  }

  const projectId = Number(query.project);
  if (Number.isInteger(projectId)) {
    addRepo('r.project_id = ?', projectId);
  }

  const reviewerId = Number(query.reviewer);
  if (Number.isInteger(reviewerId)) {
    addPr(
      'EXISTS (SELECT 1 FROM pr_reviews rv WHERE rv.pull_request_id = pr.id AND rv.reviewer_member_id = ?)',
      reviewerId
    );
  }

  const isSingle =
    (mode === 'sprint' && sprints.length === 1) || (mode === 'release' && !!release);

  // Note: scope.mode reflects the requested scope, not whether a clause was
  // actually emitted. It can be 'range' with a missing/invalid `from`/`to`
  // (or 'release' with a missing/invalid `release`) and still add no clause
  // to `where`/`clauses` — isSingle stays false in that case, but a
  // consumer must not infer "a range/release filter is applied" from mode
  // alone; check `clauses`/`where` for that.
  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : 'WHERE 1=1',
    clauses,
    params,
    prClauses,
    prParams,
    repoClauses,
    repoParams,
    scope: { mode, sprints, release, from, to, isSingle },
  };
}

module.exports = { buildPrFilter };
