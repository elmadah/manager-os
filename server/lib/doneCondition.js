/**
 * Returns a SQL condition string that checks if a column contains a "done" status.
 * Uses the story_statuses table if populated, and always includes standard done statuses (Done, Closed, Resolved).
 *
 * @param {string} column - The SQL column to check (e.g. 'st.status', 'status', 'ssh.status')
 * @returns {string} SQL condition
 */
function doneCondition(column = 'status') {
  return `(${column} IN (SELECT name FROM story_statuses WHERE category = 'done') OR LOWER(${column}) IN ('done', 'closed', 'resolved'))`;
}

/**
 * Check if a status string is a "done" status in JavaScript.
 * Queries the story_statuses table; falls back to checking against 'Done'/'Closed'/'Resolved'.
 *
 * @param {object} db - The database instance
 * @param {string} status - The status string to check
 * @returns {boolean}
 */
function isDoneStatusServer(db, status) {
  if (!status) return false;
  const row = db
    .prepare('SELECT COUNT(*) AS cnt FROM story_statuses WHERE category = ? AND name = ?')
    .get('done', status);
  if (row && row.cnt > 0) return true;

  // Always match standard done statuses
  return ['done', 'closed', 'resolved'].includes(status.toLowerCase());
}

module.exports = { doneCondition, isDoneStatusServer };
