// client/src/lib/roadmap.js
// Pure helpers for the Projects Roadmap view. All dates are 'YYYY-MM-DD' strings.

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Parse 'YYYY-MM-DD' as local midnight (NOT UTC). Returns Date or null. */
export function parseLocalDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Format Date as 'YYYY-MM-DD' in local time. */
export function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today as 'YYYY-MM-DD'. */
export function todayString() {
  return formatLocalDate(new Date());
}

/** Snap a date to the first day of its calendar quarter (Q1 starts Jan 1). */
export function snapToQuarterStart(date) {
  const month = date.getMonth();
  const qStartMonth = Math.floor(month / 3) * 3;
  return new Date(date.getFullYear(), qStartMonth, 1);
}

/** Add `n` months to a date (last day clamps within target month). */
export function addMonths(date, n) {
  const target = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const lastDayOfTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDayOfTarget));
  return target;
}

/**
 * Compute a 12-month range starting at the quarter containing `anchor`.
 * Returns { start, end } as 'YYYY-MM-DD' strings (inclusive end = last day of month).
 */
export function defaultRange(anchor = new Date()) {
  const start = snapToQuarterStart(anchor);
  // End = last day of the 12th month from start
  const end = new Date(start.getFullYear(), start.getMonth() + 12, 0);
  return { start: formatLocalDate(start), end: formatLocalDate(end) };
}

/**
 * Build a list of month ticks for the header. Each entry: { label, year, month, leftPct, widthPct }.
 */
export function monthTicks(rangeStart, rangeEnd) {
  const s = parseLocalDate(rangeStart);
  const e = parseLocalDate(rangeEnd);
  const totalMs = e.getTime() - s.getTime();
  const ticks = [];
  let cursor = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cursor <= e) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const left = ((cursor.getTime() - s.getTime()) / totalMs) * 100;
    const width = ((Math.min(next.getTime(), e.getTime() + 1) - cursor.getTime()) / totalMs) * 100;
    ticks.push({
      label: MONTH_LABELS[cursor.getMonth()],
      year: cursor.getFullYear(),
      month: cursor.getMonth(),
      leftPct: left,
      widthPct: width,
    });
    cursor = next;
  }
  return ticks;
}

/**
 * Build quarter ticks for the band above months. Each entry: { label, leftPct, widthPct }.
 * `label` like "Q2 '26 · Apr – Jun".
 */
export function quarterTicks(rangeStart, rangeEnd) {
  const s = parseLocalDate(rangeStart);
  const e = parseLocalDate(rangeEnd);
  const totalMs = e.getTime() - s.getTime();
  const ticks = [];
  let cursor = snapToQuarterStart(s);
  while (cursor <= e) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
    const visibleStart = Math.max(cursor.getTime(), s.getTime());
    const visibleEnd = Math.min(next.getTime(), e.getTime() + 1);
    if (visibleEnd <= visibleStart) { cursor = next; continue; }
    const q = Math.floor(cursor.getMonth() / 3) + 1;
    const yy = String(cursor.getFullYear()).slice(-2);
    const m0 = MONTH_LABELS[cursor.getMonth()];
    const m2 = MONTH_LABELS[cursor.getMonth() + 2];
    ticks.push({
      label: `Q${q} '${yy} · ${m0} – ${m2}`,
      leftPct: ((visibleStart - s.getTime()) / totalMs) * 100,
      widthPct: ((visibleEnd - visibleStart) / totalMs) * 100,
    });
    cursor = next;
  }
  return ticks;
}

/**
 * Compute a bar's position inside the visible window.
 * Returns null if the bar is entirely outside the window (or has no dates).
 * Returns { leftPct, widthPct, clippedStart, clippedEnd }.
 */
export function computeBarPosition({ start, target, rangeStart, rangeEnd }) {
  const r0 = parseLocalDate(rangeStart);
  const r1 = parseLocalDate(rangeEnd);
  const s = parseLocalDate(start);
  const t = parseLocalDate(target);
  if (!r0 || !r1 || !s || !t) return null;
  const span = r1.getTime() - r0.getTime();
  if (span <= 0) return null;
  const sClamped = Math.max(s.getTime(), r0.getTime());
  const eClamped = Math.min(t.getTime(), r1.getTime());
  if (eClamped < sClamped) return null;
  return {
    leftPct: ((sClamped - r0.getTime()) / span) * 100,
    widthPct: Math.max(((eClamped - sClamped) / span) * 100, 0.6),
    clippedStart: s.getTime() < r0.getTime(),
    clippedEnd: t.getTime() > r1.getTime(),
  };
}

/** Position of the today line as a percent (or null if today is outside the window). */
export function todayPercent(rangeStart, rangeEnd) {
  const r0 = parseLocalDate(rangeStart);
  const r1 = parseLocalDate(rangeEnd);
  if (!r0 || !r1) return null;
  const todayStr = formatLocalDate(new Date());
  if (todayStr < rangeStart || todayStr > rangeEnd) return null;
  const now = new Date();
  return ((now.getTime() - r0.getTime()) / (r1.getTime() - r0.getTime())) * 100;
}

/**
 * Derive a feature's roadmap health based on dates + story completion.
 * Returns 'green' | 'yellow' | 'red'.
 *
 * Rules:
 *   - red:    not complete AND target_date < today
 *   - yellow: completion_ratio < expected_ratio - 0.2 (where expected = time elapsed)
 *   - green:  otherwise
 */
export function healthOfFeature(feature, now = new Date()) {
  const status = (feature.status || '').toLowerCase();
  const isComplete = status === 'complete';
  const start = parseLocalDate(feature.start_date);
  const target = parseLocalDate(feature.target_date);
  if (!isComplete && target && now > target) return 'red';
  if (!start || !target || isComplete) return 'green';
  const span = target.getTime() - start.getTime();
  if (span <= 0) return 'green';
  const elapsed = Math.max(0, Math.min(now.getTime() - start.getTime(), span));
  const expected = elapsed / span;
  const total = feature.story_stats?.total || 0;
  const done = feature.story_stats?.completed || 0;
  const actual = total === 0 ? expected : done / total;
  if (actual < expected - 0.2) return 'yellow';
  return 'green';
}

export const HEALTH_BAR_COLORS = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
};
