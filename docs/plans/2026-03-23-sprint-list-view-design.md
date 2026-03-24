# Sprint List View — Grouped by Project

## Overview

Add a "By Project" list view to the Sprints page alongside the existing "By Status" view. A segmented control lets users toggle between views. The list view groups sprint stories by project, with collapsible groups, sortable columns, search, inline summary stats, and assignee workload indicators.

## View Switcher

- Segmented control: `[ By Status | By Project ]`
- Placed next to the existing team filter dropdown in the filter bar
- Defaults to "By Status" (current behavior unchanged)
- Sprint selector, team filter, comparison chart, and metrics cards remain unchanged in both views

## List View Layout

### Project Groups

Stories grouped by `project_name`. Each group is a collapsible accordion (expanded by default).

**Group header contains:**
- Project color dot (from `projects.color`) + project name (bold)
- Compact stat chips: `N stories` · `N pts` · `N done` · `N carry-overs` · `N new`
- Chevron icon for expand/collapse

**"Unassigned" group** (stories without a project mapping) is pinned to the top. Remaining groups sorted alphabetically.

### Table Columns

| Column | Content | Alignment | Notes |
|--------|---------|-----------|-------|
| Key | Story key badge (e.g., "PROJ-123") | Left | Compact badge style |
| Summary | Story title, truncated ~60 chars | Left | Full text on hover tooltip |
| Sprint | Current sprint name | Left | |
| Status | Color-coded badge | Left | Green=done, Blue=in-progress, Gray=to-do |
| Assignee | Team member name + workload dots | Left | See workload indicators below |
| Points | Story points | Right | Numeric |
| Release | Release date or "—" | Left | |
| Carry-overs | Carry-over count | Right | Orange when >0, bold red when >=3 |
| Actions | External link icon | Center | Opens Jira issue in new tab |

### Sorting

- Click column headers to sort within each project group
- Visual arrow indicator for sort direction
- Default sort: by Status (in-progress → to-do → done)
- Sorting applies within groups, not across them

### Search

- Search input field next to the segmented control
- Filters stories by matching key or summary (case-insensitive)
- Empty groups hidden when search is active
- "No results" message when nothing matches

## Assignee Workload Indicators

Calculated client-side from all sprint stories (not per group):

- Compute **team average** points per assignee and average carry-over count per assignee
- **Overloaded** (orange dot): assignee's total points > 1.5x team average
- **Stuck work** (red dot): assignee's carry-over count > 1.5x team average
- Both indicators can appear simultaneously
- Hover tooltip explains: e.g., "21 pts assigned (team avg: 11)"

## Actions Column

- External link icon opens `{jira_base_url}/browse/{story_key}` in a new tab
- Jira base URL derived from existing Jira integration settings or a configurable constant

## Technical Approach

### No API Changes

The existing `GET /api/sprints/:sprintName/stories?team_id=` returns all required fields: key, summary, sprint, status, assignee name, project_name, story_points, release_date, carry_over_count.

### Client Changes

1. **SprintsPage.jsx**
   - Add `viewMode` state ("status" | "project") and `searchQuery` state
   - Add segmented control and search input to the filter bar
   - Conditionally render existing status tables or new `SprintListView`

2. **New component: `SprintListView.jsx`**
   - Receives stories array as prop
   - Groups by `project_name` (null/undefined → "Unassigned")
   - Computes group summaries (story count, points, done/carry-over/new counts)
   - Renders collapsible groups with sortable tables
   - Handles search filtering

3. **Workload calculation**
   - `useMemo` hook aggregating points and carry-overs per assignee
   - Computes team averages
   - Flags assignees exceeding 1.5x threshold

### No New Dependencies

Sorting, grouping, search, and workload calculations are lightweight client-side operations on already-fetched data.
