# Jira Status Import Design

## Problem

Story statuses are hardcoded in multiple places across the app (e.g., "To Do", "In Progress", "In Review", "Done"). Since multiple Jira boards are synced — each with its own workflow — the hardcoded list doesn't match the actual Jira statuses, causing missing/wrong badge styling and incomplete filter options.

## Solution

Import the workflow-configured status list from Jira via a manual action on the Jira Settings page. Use Jira's built-in status categories (`new`, `indeterminate`, `done`) to automatically assign badge colors. All boards share one global status list.

## Data Model

New `story_statuses` table:

```sql
CREATE TABLE IF NOT EXISTS story_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,        -- "new", "indeterminate", "done" (from Jira statusCategory.key)
  display_order INTEGER DEFAULT 0,
  imported_at TEXT DEFAULT (datetime('now'))
);
```

Category-to-color mapping:
- `new` → gray (To Do)
- `indeterminate` → blue (In Progress)
- `done` → green (Done)

Import is a full replace — deletes existing rows and inserts fresh list inside a transaction.

## API

### `GET /api/jira/import-statuses`

Triggers the import:
1. Fetches all configured Jira boards from `jira_boards` table
2. For each board, calls `GET /rest/api/2/project/{projectKey}/statuses`
3. Flattens and deduplicates statuses across all boards (by name)
4. Filters to Story/Bug/Defect issue types only
5. Replaces `story_statuses` table contents in a transaction
6. Returns the imported list

### `GET /api/jira/statuses`

Returns current `story_statuses` rows ordered by `display_order`. Used by the frontend for filters and badge styles.

## Frontend Changes

### Jira Settings Page
- Add "Import Statuses" button in the board configuration area
- On click: calls import endpoint, shows toast with count, displays status list with category colors

### Shared Status Utility (`client/src/lib/statuses.js`)
- Fetches statuses from `GET /api/jira/statuses`, caches in memory
- Exports `getStatusStyle(statusName)` — returns badge CSS classes based on category
- Exports `getStatusList()` — for filter dropdowns
- Falls back to current hardcoded map if no statuses loaded

### Files to Update (replace hardcoded status lists)
- `SprintPulse.jsx` — `STATUS_PILLS` and `DONE_STATUSES`
- `TeamMemberPage.jsx` — `STATUS_OPTIONS`
- `SprintsPage.jsx` — `StatusBadge`
- `HomePage.jsx` — `STATUS_STYLES` / `STATUS_LABELS`
- `ProjectDetailPage.jsx` — story status references

## Server-Side "Done" Logic

Replace hardcoded `status = 'Done'` checks with category-based subquery:

```sql
SUM(CASE WHEN st.status IN (
  SELECT name FROM story_statuses WHERE category = 'done'
) THEN st.story_points ELSE 0 END)
```

Affected files:
- `server/routes/projects.js`
- `server/routes/features.js`

### Fallback

If `story_statuses` is empty (no import yet), all UI and SQL logic falls back to the current hardcoded behavior so nothing breaks before first import.
