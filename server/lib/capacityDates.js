/**
 * List all YYYY-MM-DD weekdays (Mon-Fri) between start and end, inclusive.
 * Input/output dates are strings in YYYY-MM-DD.
 * Returns [] if start > end.
 */
function listWeekdays(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (start > end) return [];

  const out = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getUTCDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) {
      const y = cursor.getUTCFullYear();
      const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      const d = String(cursor.getUTCDate()).padStart(2, '0');
      out.push(`${y}-${m}-${d}`);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function countWeekdays(startDate, endDate) {
  return listWeekdays(startDate, endDate).length;
}

module.exports = { listWeekdays, countWeekdays };
