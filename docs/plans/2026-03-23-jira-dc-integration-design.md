# Jira Data Center Integration

## Overview

Live integration with Jira Data Center (self-hosted) to pull stories and defects via REST API. Replaces manual CSV/JSON import with a board-level sync that auto-detects the active sprint.

## Authentication

- **Method:** Personal Access Token (PAT), available since Jira DC 8.14+
- **Storage:** SQLite database (same as all other app data)
- **Security:** PAT never sent to the browser; all Jira API calls proxied through Express backend

## Data Model

### New Tables

```sql
-- Single-row Jira connection config
CREATE TABLE jira_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  base_url TEXT NOT NULL,
  pat_token TEXT NOT NULL,
  story_points_field TEXT DEFAULT 'customfield_10026',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Registered Jira boards
CREATE TABLE jira_boards (
  id TEXT PRIMARY KEY,
  board_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Remembers Jira project key → app project mapping
CREATE TABLE jira_project_mappings (
  id TEXT PRIMARY KEY,
  jira_project_key TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  UNIQUE(jira_project_key)
);
```

### Changes to Existing `stories` Table

```sql
ALTER TABLE stories ADD COLUMN jira_board_id TEXT REFERENCES jira_boards(id);
ALTER TABLE stories ADD COLUMN epic_key TEXT;
ALTER TABLE stories ADD COLUMN epic_name TEXT;
ALTER TABLE stories ADD COLUMN issue_type TEXT;
ALTER TABLE stories ADD COLUMN last_synced_at TEXT;
```

## API Endpoints

### Settings

```
GET    /api/settings/jira              → get base_url + boards (PAT masked)
PUT    /api/settings/jira              → save/update base_url + PAT
POST   /api/settings/jira/test         → test connection (calls /rest/api/2/myself)
```

### Boards

```
POST   /api/settings/jira/boards            → add a board (board_id + label)
DELETE /api/settings/jira/boards/:id         → remove a board
GET    /api/settings/jira/boards/:id/sync    → preview: fetch active sprint, return diff
POST   /api/settings/jira/boards/:id/sync   → confirm: apply updates + new story assignments
```

## Jira REST API Calls

All calls are server-side only. Headers: `Authorization: Bearer {PAT}`.

```
# Test connection
GET {base_url}/rest/api/2/myself

# Get active sprint for a board
GET {base_url}/rest/agile/1.0/board/{boardId}/sprint?state=active

# Get issues in a sprint (paginated)
GET {base_url}/rest/agile/1.0/board/{boardId}/sprint/{sprintId}/issue
    ?fields=summary,status,assignee,story_points,issuetype,sprint,customfield_10008
    &maxResults=50&startAt=0
```

### Field Mapping

| Jira Field | DB Field |
|---|---|
| `key` | `key` |
| `fields.summary` | `summary` |
| `fields.sprint.name` | `sprint` |
| `fields.status.name` | `status` |
| `fields.assignee.displayName` | matched to `team_members.name` → `assignee_id` |
| `fields.story_points` or custom field | `story_points` |
| `fields.issuetype.name` | `issue_type` |
| `fields.customfield_10008` (epic link) | `epic_key` / `epic_name` |

The story points custom field ID is configurable in `jira_settings.story_points_field`.

## Sync Logic

### Two-Step Sync (Preview → Confirm)

**Step 1 — Preview (`GET .../sync`):**
1. Fetch active sprint via board API
2. Fetch all issues in that sprint (paginated)
3. Match against existing stories by `key`
4. Return: updated stories (count + changes), new stories (full details)

**Step 2 — Confirm (`POST .../sync`):**
1. Receives project + feature assignments for new stories
2. Updates existing stories in DB (status, points, assignee, sprint)
3. Inserts new stories with assignments
4. Records `last_synced_at` timestamp

### Matching & Existing Data

- **Existing stories from CSV import** stay as-is. They have no `jira_board_id` (null) and that's fine.
- On first sync, if a story `key` (e.g. `MOBILE-123`) already exists from a prior CSV import, it gets **updated in place** — status, points, assignee, sprint refresh, and `jira_board_id` + `last_synced_at` get set.
- **Project and feature assignments are preserved** — sync never overwrites those.
- Stories only get linked to a board when a sync finds a matching key. No bulk migration needed.

### Matching Rules

- **Existing stories:** matched by `key` field (e.g. `MOBILE-123`)
- **Assignee matching:** `assignee.displayName` matched against `team_members.name`. Null if no match (no auto-creation of team members).
- **Sprint carry-over:** if story exists and sprint name changed, increment `carry_over_count`. New stories get `carry_over_count = 0` and `first_seen_sprint` set to current sprint.
- **Removed from sprint:** stories no longer in the active sprint are not deleted or modified — they retain their last known state.
- **Closed stories:** still synced — status reflects "Done" from Jira.

### Error Handling

- Jira unreachable → connection error, suggest checking URL/VPN
- 401 → PAT expired/invalid, prompt to regenerate
- 404 on board → suggest verifying board ID

## UI Design

### Settings Page (`/settings`)

New route, linked from sidebar (gear icon at bottom).

**Three sections:**

1. **Jira Connection** — base URL input, PAT input (password-masked), "Test Connection" button with inline success/error feedback
2. **Story Points Field** — custom field ID input, defaults to `customfield_10026`, with help text
3. **Boards** — list of registered boards (label + board ID). "Add Board" opens inline form. Each row has delete action and "Sync" button.

### Post-Sync Modal

Triggered by clicking "Sync" on a board row. After loading:

- **Updated stories section** — summary count of stories updated (no action needed)
- **New stories section** — table with columns: key, summary, type, epic name. Each row has a project dropdown and feature dropdown (filtered by selected project). "Confirm" button to apply.

## Scope

**In scope:**
- Stories and Bugs (issue types)
- Epic key/name as metadata on stories
- Active sprint sync per board
- Manual sync trigger

**Out of scope (future):**
- Auto-sync on schedule
- Webhook-based real-time sync
- Creating/updating Jira issues from the app
- OAuth authentication
- Syncing completed/past sprints
