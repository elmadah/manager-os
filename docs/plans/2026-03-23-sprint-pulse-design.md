# Sprint Pulse Widget — Replace Homepage Timeline

## Summary

Replace the Project Timeline widget on the homepage with a compact "Sprint Pulse" card that shows the current sprint's progress, attention flags, and per-member status at a glance. The timeline is confusing because it's based on project dates, not sprint reality.

## Widget Layout

Three horizontal zones in a single card:

```
┌─────────────────────────────────────────────────────────┐
│  Sprint Pulse                   [Team filter]  "Sprint 24" │
├────────┬────────────────────────────────────────────────┤
│        │                                                │
│ Progress│  Flag Badges                                  │
│  Ring   │  [4 carry-overs] [2 stuck] [1 blocked] [1 un.]│
│  12/20  │                                                │
├─────────┴───────────────────────────────────────────────┤
│  Team: (A) (D) (E) (J) (M) (P) (R) (S)                │
│         🟢  🟠  🟢  🔴  🟢  🟢  🟢  🟠                 │
└─────────────────────────────────────────────────────────┘
```

- **Left**: SVG circular progress ring — completed/total stories
- **Right of ring**: Flag badges (only shown when count > 0)
- **Bottom row**: Team member initials with colored status dots
- **Clicking a member**: Shows popover with their sprint stories (key, summary, status, flags). Max 10 items, "View in Sprints" link at bottom.

## Flags

| Flag | Logic | Color |
|------|-------|-------|
| Carry-overs | `sprint_status === 'carried_over'` | Orange |
| Stuck | Not done AND in stale map (no recent standup) | Red |
| Blocked | Story ID matches an active blocker's story | Red |
| Unassigned | `assignee_id` is null | Yellow |

## Team Member Dot Colors

- **Green**: All stories progressing (have recent standup or status moved)
- **Orange**: Has at least one stuck or unassigned story
- **Red**: Has a blocked story or 2+ carry-overs

## Multi-team Support

- Single card with optional team filter dropdown (only shown if teams exist)
- Default: all teams aggregated
- Filter passed as `?team_id=` to sprint/story endpoints

## Current Sprint Detection

Most recently imported sprint — `GET /api/sprints` returns sorted, take `sprints[0]`.

## API Calls (all existing, no new endpoints)

1. `GET /api/sprints?team_id=` — sprint list + summary stats
2. `GET /api/sprints/:name/stories?team_id=` — stories for flags + popovers
3. `GET /api/standups/stale` — stuck story detection
4. `GET /api/blockers?status=active` — blocked story cross-reference
5. `GET /api/teams` — team filter options (new to homepage, existing endpoint)

No schema changes. No new routes. All cross-referencing is client-side.

## Files to Change

### New
- `client/src/components/SprintPulse.jsx` — self-contained widget
  - Fetches own data, accepts `teamId` prop
  - Contains progress ring (SVG), flag badges, team row, popover

### Modify
- `client/src/pages/HomePage.jsx`
  - Remove `<Timeline />` import and rendering
  - Add `<SprintPulse />` in its place
  - Add team filter dropdown, pass `teamId` to widget

### No changes to
- Timeline components (keep files, just unused on homepage)
- Server code
- Other pages

## Empty State

If no sprints exist: "No sprint data yet — import from Jira to see your Sprint Pulse" with icon, matching Sprints page empty state style.

## Implementation Steps

1. Create `SprintPulse.jsx` with data fetching and loading/empty states
2. Build SVG progress ring sub-component
3. Build flag badges section
4. Build team member row with status dot logic
5. Build member popover (story list + "View in Sprints" link)
6. Modify `HomePage.jsx` — swap Timeline for SprintPulse, add team filter
7. Verify with dev server
