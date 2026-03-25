import api from './api';

// Category → Tailwind badge classes
const CATEGORY_STYLES = {
  new: 'bg-gray-100 text-gray-600',
  indeterminate: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
};

// Hardcoded fallback when no statuses have been imported yet
const FALLBACK_STATUSES = [
  { name: 'To Do', category: 'new' },
  { name: 'In Progress', category: 'indeterminate' },
  { name: 'In Review', category: 'indeterminate' },
  { name: 'Done', category: 'done' },
];

let cachedStatuses = null;
let fetchPromise = null;

/**
 * Fetch statuses from the API and cache them.
 * Returns the cached list on subsequent calls.
 * Call with force=true to refresh the cache.
 */
export async function fetchStatuses(force = false) {
  if (cachedStatuses && !force) return cachedStatuses;
  if (fetchPromise && !force) return fetchPromise;

  fetchPromise = api
    .get('/settings/jira/statuses')
    .then((data) => {
      cachedStatuses = data && data.length > 0 ? data : null;
      fetchPromise = null;
      return cachedStatuses;
    })
    .catch(() => {
      fetchPromise = null;
      return null;
    });

  return fetchPromise;
}

/**
 * Get the list of story statuses (cached or fallback).
 */
export function getStatusList() {
  return cachedStatuses || FALLBACK_STATUSES;
}

/**
 * Get badge CSS classes for a given status name.
 */
export function getStatusStyle(statusName) {
  if (!statusName) return CATEGORY_STYLES.new;

  const statuses = getStatusList();
  const lower = statusName.toLowerCase();
  const match = statuses.find((s) => s.name.toLowerCase() === lower);

  if (match) return CATEGORY_STYLES[match.category] || CATEGORY_STYLES.indeterminate;

  // Default to indeterminate for unknown statuses
  return CATEGORY_STYLES.indeterminate;
}

/**
 * Check if a status name is in the "done" category.
 */
export function isDoneStatus(statusName) {
  if (!statusName) return false;

  const statuses = getStatusList();
  const lower = statusName.toLowerCase();
  const match = statuses.find((s) => s.name.toLowerCase() === lower);

  if (match) return match.category === 'done';

  // Fallback for common done-like statuses when no import has been done
  return ['done', 'closed', 'resolved'].includes(lower);
}

/**
 * Get status names that belong to a specific category.
 */
export function getStatusesByCategory(category) {
  return getStatusList().filter((s) => s.category === category);
}
