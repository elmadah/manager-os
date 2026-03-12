const db = require('../db/init');

const DONE_STATUSES = ['done', 'closed', 'resolved'];

function isDone(status) {
  return status && DONE_STATUSES.includes(status.toLowerCase());
}

/**
 * Compute diff status for each parsed row against existing stories in the DB.
 * @param {Array} rows - Parsed rows with: key, summary, sprint, status, assignee, story_points, release_date, assignee_id
 * @returns {Array} rows with diff_status added
 */
function computeDiff(rows) {
  const keys = rows.map(r => r.key);
  if (keys.length === 0) return [];

  // Fetch all existing stories matching the keys
  const placeholders = keys.map(() => '?').join(',');
  const existing = db.prepare(
    `SELECT s.key, s.summary, s.sprint, s.status, s.assignee_id, s.story_points, s.release_date
     FROM stories s WHERE s.key IN (${placeholders})`
  ).all(...keys);

  const existingMap = new Map();
  for (const row of existing) {
    existingMap.set(row.key, row);
  }

  return rows.map(row => {
    const ex = existingMap.get(row.key);

    if (!ex) {
      return { ...row, diff_status: 'new' };
    }

    // Check if status changed to done
    const nowDone = isDone(row.status);
    const wasDone = isDone(ex.status);

    if (nowDone && !wasDone) {
      return { ...row, diff_status: 'closed' };
    }

    // Check if sprint changed and status is not done → carry_over
    const sprintChanged = row.sprint !== ex.sprint;
    if (sprintChanged && !nowDone) {
      return { ...row, diff_status: 'carry_over' };
    }

    // Check if any field changed
    const changed =
      row.summary !== ex.summary ||
      row.status !== ex.status ||
      row.sprint !== ex.sprint ||
      row.assignee_id !== ex.assignee_id ||
      (row.story_points || 0) !== (ex.story_points || 0);

    if (changed) {
      return { ...row, diff_status: 'updated' };
    }

    return { ...row, diff_status: 'unchanged' };
  });
}

module.exports = { computeDiff, isDone };
