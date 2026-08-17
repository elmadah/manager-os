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
    clauses,
    params,
    scope: { mode, sprints, release, from, to, isSingle },
  };
}

module.exports = { buildPrFilter };
