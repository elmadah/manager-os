# Sprint Team Capacity Calculator

## Summary

Replace the current Excel-based sprint capacity workflow with an in-app planner. At the start of each sprint, the user creates a **capacity plan** scoped to a team and a date range, marks each member's planned leave on a day grid, and sees auto-computed hours, points, and required allocation for the team and per member. Unplanned leave (sick days, etc.) added mid-sprint is tracked separately so the user can see planned-vs-actual capacity as the sprint progresses. Loans to other teams and full-sprint exclusions are first-class concepts.

## Goals

- Model a sprint capacity plan before the Jira sprint exists; link to it by name later.
- Replace the Excel "check a box per day per member" flow with a faster grid + "add range" shortcut.
- Track planned vs. unplanned leave, with totals showing the delta.
- Handle multi-team reality: plans are scoped to a team, and members can be loaned out or excluded.
- Auto-compute hours, points, and required allocation using the user's existing formulas.

## Non-goals (v1)

- Half-day leave (full-day only for v1).
- Per-member working hours (everyone is 8h/day flat).
- A recurring company holiday calendar (country-specific holidays are logged per-member as leave).
- Comparing planned capacity to committed story points from Jira.
- Capacity trend charts across sprints.
- Notifications when unplanned leave breaches a threshold.

## Data Model

Three new tables + two global settings.

### `capacity_plans`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT NOT NULL | e.g. "Sprint 48 planning" |
| `team_id` | INTEGER FK → `teams(id)` | Nullable; set null (not cascade) if team deleted |
| `start_date` | TEXT NOT NULL | YYYY-MM-DD |
| `end_date` | TEXT NOT NULL | YYYY-MM-DD |
| `jira_sprint_name` | TEXT | Filled in after the Jira sprint exists; used for cross-linking |
| `hours_per_point_override` | REAL | Nullable, reserved; reads global setting when null |
| `allocation_factor_override` | REAL | Nullable, reserved; reads global setting when null |
| `created_at`, `updated_at` | TEXT | |

### `capacity_plan_members`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `plan_id` | INTEGER FK → `capacity_plans(id)` ON DELETE CASCADE | |
| `member_id` | INTEGER FK → `team_members(id)` | |
| `is_excluded` | INTEGER DEFAULT 0 | Excluded members hidden from grid + totals |

Auto-populated on plan creation from `team_member_assignments` for the team. Off-team members (borrowed contractors) can be added manually.

### `capacity_leave`

One row per (member, day) where leave exists.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `plan_id` | INTEGER FK → `capacity_plans(id)` ON DELETE CASCADE | |
| `member_id` | INTEGER FK → `team_members(id)` | |
| `leave_date` | TEXT NOT NULL | YYYY-MM-DD |
| `leave_type` | TEXT CHECK IN (`vacation`, `holiday`, `sick`, `loaned`, `other`) | |
| `is_planned` | INTEGER DEFAULT 1 | 0 = added after sprint started |
| `loan_team_id` | INTEGER FK → `teams(id)` | Only meaningful when `leave_type = 'loaned'`; nullable |
| `loan_project_id` | INTEGER FK → `projects(id)` | Optional even for loans |
| `loan_note` | TEXT | Optional |
| `created_at` | TEXT | |

- `UNIQUE(plan_id, member_id, leave_date)` — one leave state per cell.

### Global settings

Stored either in a new `app_settings(key TEXT PRIMARY KEY, value TEXT)` table or by extending the existing settings pattern.

- `hours_per_point` — default `8`
- `allocation_factor` — default `0.9`

Values are read at compute time, not frozen on the plan, so editing them updates all plans on next load.

## API Routes

Mounted under `/api`, new router file `server/routes/capacity.js`.

### Plans

- `GET /api/capacity-plans?team_id=` — list, optionally filtered by team. Returns summary (name, dates, team, member count, totals).
- `POST /api/capacity-plans` — `{ name, team_id, start_date, end_date, jira_sprint_name? }`. Server auto-creates `capacity_plan_members` rows from `team_member_assignments`.
- `GET /api/capacity-plans/:id` — full plan + members + leave entries + computed totals (see **Calculations**).
- `PUT /api/capacity-plans/:id` — edit name, dates, `jira_sprint_name`. If dates narrow, leave entries outside the new range are deleted.
- `DELETE /api/capacity-plans/:id` — cascades to members + leave.

### Members on a plan

- `POST /api/capacity-plans/:id/members` — add off-team member (`{ member_id }`).
- `PATCH /api/capacity-plans/:id/members/:member_id` — toggle `is_excluded`.
- `DELETE /api/capacity-plans/:id/members/:member_id` — remove ad-hoc member; core team members can only be excluded, not removed.

### Leave

- `PUT /api/capacity-plans/:id/leave` — upsert one cell. `{ member_id, leave_date, leave_type, is_planned, loan_team_id?, loan_project_id?, loan_note? }`. `leave_type = null` or a `DELETE` clears the cell.
- `POST /api/capacity-plans/:id/leave/range` — bulk upsert. `{ member_id, start_date, end_date, leave_type, is_planned, loan_* }`. Server expands to one row per weekday in range.

### `is_planned` default logic

Server sets `is_planned = 1` when `today <= plan.start_date`, else `0`. Request body can override.

## UI

### Sidebar + routing

- New sidebar entry "Capacity" (calendar-check icon).
- Two new routes under `<Layout />`: `/capacity` (list) and `/capacity/:id` (detail).

### `/capacity` — Plans list

- Header: "Capacity" + "New plan" button. Optional team filter dropdown.
- Table sorted by `start_date` desc: Name · Team · Dates · Linked Jira sprint · Planned hours · Actual hours · Utilization %.
- Row click → detail. Inline Edit / Delete.
- "New plan" modal: name, team dropdown, start_date, end_date, optional `jira_sprint_name`. On save, navigates to the detail page.

### `/capacity/:id` — Plan detail

**Top bar**: plan name (inline editable), dates, team label, `jira_sprint_name` input (saves on blur).

**Totals panel** (see **Calculations**) — three sections side by side, always visible.

**Grid** — the core surface:

- Rows = non-excluded members; columns = each weekday between `start_date` and `end_date` (short `Mon 21` labels).
- Each cell is clickable. Empty = present. Colored = leave, color-coded by `leave_type`:
  - `vacation` = blue
  - `holiday` = gray
  - `sick` = orange
  - `loaned` = purple
  - `other` = neutral
- A dashed border / dot indicates `is_planned = 0` (unplanned).
- Click a cell → popover: leave type dropdown, planned/unplanned toggle, loan fields (conditional on `leave_type = 'loaned'`: team dropdown, project dropdown, note). "Clear" button removes the cell.
- Right edge of each row: per-member mini-summary (working days, hours, points, required allocation).
- Left edge of each row: member name, role, kebab menu ("Exclude from plan" / "Re-include").

**"Add range" button** above the grid → modal: member dropdown, date range, leave type, planned flag, loan fields. Creates/updates cells in bulk.

**Excluded members** — collapsed section below the grid, "Re-include" button each.

## Calculations

All computed server-side in `GET /api/capacity-plans/:id` so the client just renders.

### Per-member row (non-excluded only)

```
working_days          = count of weekdays between start_date and end_date inclusive
planned_leave_days    = count of leave rows where is_planned = 1
unplanned_leave_days  = count of leave rows where is_planned = 0
planned_hours         = (working_days - planned_leave_days) * 8
actual_hours          = (working_days - planned_leave_days - unplanned_leave_days) * 8
points                = ROUND(actual_hours / hours_per_point, 1)
required_allocation   = ROUND(actual_hours * allocation_factor, 0)
utilization_pct       = actual_hours / (working_days * 8) * 100
```

### Team totals panel

Three sections side by side:

1. **Capacity** — team `planned_hours`, `actual_hours`, delta. Team total points. Team required allocation. Overall utilization %.
2. **Planned vs Actual** — large number each, delta highlighted:
   - green if unplanned leave dropped capacity < 5%
   - amber if 5–10%
   - red if > 10%
3. **Breakdown by leave type** — small bar chart / list: hours lost to vacation, holiday, sick, loaned, other. Loaned entries grouped by destination team ("→ Platform team: 24h").

Excluded members contribute to no totals and don't appear in the grid.

### Loan accounting

Loaned hours are subtracted from this plan's capacity — they're "gone" from this team's perspective. The loan destination is informational only; it doesn't credit the destination team's plan. If that team wants to count the loan, they'd add the member to their own plan.

## Cross-link with SprintsPage

- When `capacity_plans.jira_sprint_name` exactly matches an imported Jira sprint name, `SprintsPage` shows a small badge on that sprint row: "Planned 240h · Actual 210h · 18pts", linking to the capacity plan.
- Capacity plan detail shows a reverse link when the Jira sprint exists: "View sprint analytics →".
- No schema change to `stories` or `story_sprint_history` — it's a name join.

## Settings page additions

New "Capacity planning" section with two numeric inputs:

- `hours_per_point` (default 8)
- `allocation_factor` (default 0.9, accepts 0.0–1.0)

Changing these recalculates totals for all plans on next load.

## Edge cases & defaults

- `start_date > end_date` — blocked on create/edit with validation error.
- Zero-working-days plan (e.g., weekend-only) — allowed; totals are zero, warning banner shown.
- Member removed from team after plan creation — stays on the plan (historical accuracy), shown with "no longer on team" tag.
- `today > start_date` — new leave entries default to `is_planned = 0`. Editable.
- Team deletion — `team_id` set null (FK is `ON DELETE SET NULL`, not cascade); plan remains readable for history.
- Loan destination team deletion — `loan_team_id` set null; note remains.

## Implementation phases

Suggested ordering (not binding):

1. Schema migrations + settings read/write.
2. `capacity.js` router with plans + members + leave + calculations.
3. `/capacity` list page + "New plan" modal.
4. `/capacity/:id` detail page: top bar + grid + cell popover.
5. "Add range" modal.
6. Totals panel (all three sections).
7. Settings page inputs.
8. SprintsPage badge cross-link.
