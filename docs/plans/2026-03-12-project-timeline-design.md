# Project Timeline Design

## Purpose

Add a Gantt-style timeline view to the dashboard that provides:
1. **Team workload visibility** — See which team members are allocated to which projects/features over time
2. **Project scheduling** — Plan and visualize when projects/features start and end, track overlaps

## Data Model Changes

### Add dates to features

Features currently have status/priority but no dates. Add:

```sql
ALTER TABLE features ADD COLUMN start_date TEXT;
ALTER TABLE features ADD COLUMN target_date TEXT;
```

### Add color to projects

Each project gets a color from a fixed palette for color-coded bars:

```sql
ALTER TABLE projects ADD COLUMN color TEXT DEFAULT '#3B82F6';
```

### Team member to feature mapping

Derived from stories — a feature's assigned team members = distinct `assignee_id` values from its stories. No new tables needed.

## Layout

```
+---------------------------------------------+----------------------+
|  Timeline Project                            |  Project Overview    |
|  [< >]  [Apr 10-16, 2025]  [Week | Month]   |  [April v]           |
|                                              |  +-----------------+ |
|  Team      10  11  12  13  14  15  16        |  | Mini Calendar   | |
|  Members   Thu Fri Sat Sun Mon Tue Wed       |  | (clickable)     | |
|                                              |  +-----------------+ |
|  Janson    ============  (Feature A)         |                      |
|  Tahsan         ========== (Feature B)       |  Today               |
|  Jelin     ============                      |  +------------------+|
|                 ============= (Feature C)    |  | Feature name     ||
|                                              |  | Date range       ||
|            <- Today line (dashed)            |  | Assignee avatars ||
|                                              |  +------------------+|
|  [> Project Name] (expand to features)       |                      |
+---------------------------------------------+----------------------+
```

### Left panel — Team members (Y-axis)
- Avatar + name for each team member
- Rows grouped by team member
- Each member's row shows the feature bars they're assigned to

### Center — Timeline grid
- **Week view**: 7 day columns, labeled with date + day name
- **Month view**: 4-5 week columns, labeled with week range (e.g., "Apr 7-13")
- Feature bars span columns based on `start_date` to `target_date`
- Bars are color-coded by parent project color
- Feature name + icon inside the bar (if wide enough)
- Dashed vertical line for "today"
- Hover tooltip: feature name, project name, date range, assignees

### Top controls
- Previous/Next navigation arrows
- Date range label
- Week/Month toggle
- Today button (jump to current date)

### Drill-down
- Default: collapsed project-level rows (one bar per project per team member)
- Click a project bar to expand into individual feature bars

### Right sidebar
- Mini calendar for current month (clickable dates)
- Agenda list: features happening today and upcoming, grouped by date
- Each item: feature name, date range, project color dot, assignee avatars
- Clicking a date in the mini calendar switches to week view centered on that date

## API

### `GET /api/timeline`

**Query params:** `start_date`, `end_date`, `view` (week|month)

**Response:**

```json
{
  "team_members": [
    {
      "id": 1,
      "name": "Janson Roy",
      "projects": [
        {
          "id": 5,
          "name": "Design System",
          "color": "#3B82F6",
          "start_date": "2025-04-10",
          "target_date": "2025-04-14",
          "features": [
            {
              "id": 12,
              "name": "Component Library",
              "start_date": "2025-04-10",
              "target_date": "2025-04-12",
              "status": "in_progress",
              "assignees": [
                { "id": 1, "name": "Janson Roy" },
                { "id": 2, "name": "Tahsan Khan" }
              ]
            }
          ]
        }
      ]
    }
  ],
  "date_range": { "start": "2025-04-10", "end": "2025-04-16" }
}
```

**SQL logic:**
- Join `features` -> `stories` -> `team_members` for assignees per feature
- Join `features` -> `projects` for project color and name
- Filter: `features.target_date >= :start_date AND features.start_date <= :end_date`
- Group by team member, then by project

Sidebar agenda uses the same data filtered/sorted on the frontend. No separate endpoint needed.

## Frontend Components

All new files under `client/src/components/timeline/` and one page:

| Component | Responsibility |
|-----------|---------------|
| `TimelinePage.jsx` | Page component. Manages state (date range, view mode, expanded projects). Fetches `/api/timeline`. Renders layout. |
| `TimelineGrid.jsx` | Renders column headers and maps team members to rows. Draws "today" line. |
| `TimelineBar.jsx` | Single feature/project bar. Calculates position/width as percentages. Applies project color. Hover tooltip. Click to expand. |
| `TimelineMemberRow.jsx` | One row per team member. Avatar + name on left. Stacks bars vertically for overlapping features. |
| `TimelineSidebar.jsx` | Mini calendar + agenda list. Date click navigates timeline. |
| `TimelineControls.jsx` | Prev/Next arrows, date range label, Week/Month toggle, Today button. |

No external dependencies. Bars are positioned `div`s with Tailwind. Mini calendar is a custom grid.

## Interactions & Edge Cases

### Bar positioning
- `left` = percentage offset from range start to feature start_date
- `width` = percentage of feature duration relative to visible range
- Bars extending beyond visible range clip via `overflow-hidden`

### Overlapping features
- If a member has 2+ features overlapping in time, stack vertically (sub-rows, ~40px each)
- Row auto-expands to fit

### Drill-down
- Default: one aggregated bar per project per team member
- Click project bar to expand into child feature bars (indented)
- Click again to collapse

### Empty states
- Member with no features in range: greyed-out "No scheduled work"
- Feature missing start_date or target_date: omit from timeline
- No data at all: empty state prompting to add dates to features

### Navigation
- Week view: Prev/Next shifts 7 days
- Month view: Prev/Next shifts 1 month
- Mini calendar date click: switch to week view centered on that date
- Today button: jump to current week/month

### Router
- New route: `/timeline`
- Add "Timeline" to sidebar nav in `Layout.jsx` with a lucide-react icon (e.g., `GanttChart`)
