/**
 * Returns a SQL condition string that checks if a column contains a "done" status.
 * Uses the story_statuses table if populated, falls back to status = 'Done'.
 *
 * @param {string} column - The SQL column to check (e.g. 'st.status', 'status', 'ssh.status')
 * @returns {string} SQL condition
 */
function doneCondition(column = 'status') {
  return `(${column} IN (SELECT name FROM story_statuses WHERE category = 'done') OR (NOT EXISTS(SELECT 1 FROM story_statuses) AND ${column} = 'Done'))`;
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

  // Check if table has any rows at all
  const total = db.prepare('SELECT COUNT(*) AS cnt FROM story_statuses').get();
  if (total && total.cnt > 0) return false;

  // Fallback when no statuses imported
  return ['done', 'closed', 'resolved'].includes(status.toLowerCase());
}

module.exports = { doneCondition, isDoneStatusServer };
