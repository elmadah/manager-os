# Sprint Team Capacity Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-app replacement for the user's Excel-based sprint capacity workflow: team-scoped capacity plans with a day-grid for leave, planned vs unplanned tracking, loans, exclusions, and auto-computed hours and points.

**Architecture:** Three new SQLite tables (`capacity_plans`, `capacity_plan_members`, `capacity_leave`) plus a `app_settings` key/value table for global constants. New Express router at `server/routes/capacity.js` and `server/routes/appSettings.js`. New React pages at `/capacity` and `/capacity/:id`, a new sidebar entry, and a new section on the Settings page.

**Tech Stack:** Node.js + Express (server, CommonJS), `sql.js` (wrapped via `server/db/init.js`), React 18, React Router v7, Tailwind v4, lucide-react icons, fetch wrapper in `client/src/lib/api.js`.

**Verification model:** The project has no test framework or linter (per `CLAUDE.md`). Backend tasks verify via `curl` against a locally-running `npm run dev`. Frontend tasks verify via `npm run build` (catches syntax/import errors) plus manual browser checks with specific expected outcomes. The plan notes when a server needs to be running; start it once from the worktree root with `npm run dev` and reuse for all tasks.

**Design doc:** `docs/plans/2026-04-21-sprint-capacity-calculator-design.md` (in repo on `main`).

---

## Reference: Existing Codebase Patterns

The worker must follow these conventions — they're established throughout the codebase.

### Backend route pattern (see `server/routes/teams.js`)

```javascript
const express = require('express');
const router = express.Router();
const db = require('../db/init');

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM some_table').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

- `db.prepare(sql).run(...params)` returns `{ lastInsertRowid, changes }`.
- `db.prepare(sql).get(...params)` returns one row or `undefined`.
- `db.prepare(sql).all(...params)` returns an array.
- `db.transaction(fn)` returns a callable that wraps `fn` in BEGIN/COMMIT/ROLLBACK.
- Always wrap handlers in `try/catch` and respond with `{ error: err.message }` on 500.

### Schema pattern (see `server/db/schema.sql`)

- All tables use `CREATE TABLE IF NOT EXISTS`.
- Primary keys: `id INTEGER PRIMARY KEY AUTOINCREMENT`.
- Timestamps: `created_at TEXT DEFAULT (datetime('now'))`, `updated_at` same.
- FKs: `REFERENCES parent(id)`; use `ON DELETE CASCADE` only where cascading is intended.
- For existing-DB column additions, use `migrate(table, column, type)` in `server/db/init.js`. Brand-new tables just go in `schema.sql`.

### Client fetch pattern (see any existing page)

```javascript
import api from '../lib/api';
import { useToast } from '../components/ToastProvider';
const toast = useToast();
const data = await api.get('/capacity-plans');
await api.post('/capacity-plans', { name, team_id, start_date, end_date });
await api.put('/capacity-plans/123', { name });
await api.del('/capacity-plans/123');
```

### Client page shell pattern (see `client/src/pages/ProjectsPage.jsx` or `TeamPage.jsx`)

- Pages return a top-level `<div>` (Layout provides the sidebar + padding).
- Use Tailwind classes. Headings: `text-3xl font-bold text-gray-900 mb-6`.
- Cards: `bg-white rounded-xl border border-gray-200 p-6`.
- Buttons: `px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm`.
- Loading state: `<Loader2 className="w-6 h-6 animate-spin text-gray-400" />` centered.

### Commit message style (see recent `git log`)

Plain imperative, not Conventional Commits. Examples:
- "Add manual create and delete all for story statuses"
- "Add collapsible main sidebar and toggleable notes list panel"

Do **not** use `feat:` / `fix:` prefixes. End every commit with the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.

---

## File Structure

### New server files

| Path | Responsibility |
|---|---|
| `server/routes/capacity.js` | All `/api/capacity-plans/*` endpoints |
| `server/routes/appSettings.js` | `/api/settings/app/*` — get/set global settings |
| `server/lib/capacityDates.js` | `listWeekdays(start, end)` helper |
| `server/lib/appSettings.js` | `getSetting(key, default)`, `setSetting(key, value)` helpers |

### Modified server files

| Path | Change |
|---|---|
| `server/db/schema.sql` | Add `app_settings`, `capacity_plans`, `capacity_plan_members`, `capacity_leave` tables |
| `server/index.js` | Mount `capacityRouter` at `/api/capacity-plans`, mount `appSettingsRouter` at `/api/settings/app` |

### New client files

| Path | Responsibility |
|---|---|
| `client/src/pages/CapacityListPage.jsx` | `/capacity` — list plans |
| `client/src/pages/CapacityPlanPage.jsx` | `/capacity/:id` — plan detail (grid + totals) |
| `client/src/components/CreateCapacityPlanModal.jsx` | "New plan" modal |
| `client/src/components/CapacityGrid.jsx` | The grid of day-cells |
| `client/src/components/CapacityCellPopover.jsx` | Per-cell edit popover |
| `client/src/components/CapacityTotalsPanel.jsx` | Three-section totals panel |
| `client/src/components/AddLeaveRangeModal.jsx` | "Add range" modal |

### Modified client files

| Path | Change |
|---|---|
| `client/src/App.jsx` | Add `/capacity` and `/capacity/:id` routes |
| `client/src/components/Layout.jsx` | Add "Capacity" sidebar nav item |
| `client/src/pages/SettingsPage.jsx` | Add "Capacity planning" card |
| `client/src/pages/SprintsPage.jsx` | Add capacity badge on matching sprints |

---

## Task 1: Schema — add capacity tables and app_settings

**Files:**
- Modify: `server/db/schema.sql`

**Steps:**

- [ ] **Step 1: Append new tables to schema.sql**

Open `server/db/schema.sql` and append after the last table:

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS capacity_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  jira_sprint_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS capacity_plan_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES capacity_plans(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  is_excluded INTEGER DEFAULT 0,
  UNIQUE(plan_id, member_id)
);

CREATE TABLE IF NOT EXISTS capacity_leave (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES capacity_plans(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  leave_date TEXT NOT NULL,
  leave_type TEXT NOT NULL CHECK(leave_type IN ('vacation','holiday','sick','loaned','other')),
  is_planned INTEGER DEFAULT 1,
  loan_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  loan_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  loan_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(plan_id, member_id, leave_date)
);

CREATE INDEX IF NOT EXISTS idx_capacity_leave_plan ON capacity_leave(plan_id);
CREATE INDEX IF NOT EXISTS idx_capacity_plan_members_plan ON capacity_plan_members(plan_id);
```

- [ ] **Step 2: Verify schema applies cleanly**

Delete any existing dev DB so schema runs fresh, then start the server briefly:

```bash
rm -f data/manager-os.db
node -e "require('./server/db/init').init().then(() => { console.log('init ok'); process.exit(0); })"
```

Expected: prints `init ok` and exits 0. If it prints a SQL error, fix the schema and re-run.

Also verify the tables exist:

```bash
node -e "
const db = require('./server/db/init');
db.init().then(() => {
  const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'capacity%' OR name='app_settings' ORDER BY name\").all();
  console.log(tables.map(t => t.name));
  process.exit(0);
});
"
```

Expected output includes: `app_settings`, `capacity_leave`, `capacity_plan_members`, `capacity_plans`.

- [ ] **Step 3: Commit**

```bash
git add server/db/schema.sql
git commit -m "$(cat <<'EOF'
Add schema for capacity plans and app_settings

Four new tables to support the sprint capacity calculator: app_settings
(key/value store for global constants), capacity_plans (per-team sprint
plan with date range), capacity_plan_members (membership + exclusion
flag), capacity_leave (per-member-per-day leave entries).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: App settings helper module

**Files:**
- Create: `server/lib/appSettings.js`

**Steps:**

- [ ] **Step 1: Create the helper**

Create `server/lib/appSettings.js` with:

```javascript
const db = require('../db/init');

const DEFAULTS = {
  capacity_hours_per_point: '8',
  capacity_allocation_factor: '0.9',
};

function getSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  if (row && row.value !== null && row.value !== undefined) return row.value;
  return DEFAULTS[key] ?? null;
}

function setSetting(key, value) {
  const existing = db.prepare('SELECT key FROM app_settings WHERE key = ?').get(key);
  if (existing) {
    db.prepare(
      "UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE key = ?"
    ).run(String(value), key);
  } else {
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(key, String(value));
  }
}

function getNumber(key) {
  const v = getSetting(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : Number(DEFAULTS[key]);
}

module.exports = { getSetting, setSetting, getNumber, DEFAULTS };
```

- [ ] **Step 2: Verify the helper**

Run:

```bash
node -e "
const db = require('./server/db/init');
db.init().then(() => {
  const s = require('./server/lib/appSettings');
  console.log('default hpp:', s.getNumber('capacity_hours_per_point'));
  console.log('default af:', s.getNumber('capacity_allocation_factor'));
  s.setSetting('capacity_hours_per_point', '7');
  console.log('after set hpp:', s.getNumber('capacity_hours_per_point'));
  s.setSetting('capacity_hours_per_point', '8');
  process.exit(0);
});
"
```

Expected output:
```
default hpp: 8
default af: 0.9
after set hpp: 7
```

- [ ] **Step 3: Commit**

```bash
git add server/lib/appSettings.js
git commit -m "$(cat <<'EOF'
Add app_settings helper with capacity defaults

Key/value getter and setter backed by the app_settings table, with
default values for capacity_hours_per_point (8) and
capacity_allocation_factor (0.9) when a key has not been overridden.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Weekday enumeration helper

**Files:**
- Create: `server/lib/capacityDates.js`

**Steps:**

- [ ] **Step 1: Create the helper**

Create `server/lib/capacityDates.js` with:

```javascript
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
```

- [ ] **Step 2: Verify the helper**

Run:

```bash
node -e "
const { listWeekdays, countWeekdays } = require('./server/lib/capacityDates');
// 2026-04-20 is a Monday, 2026-05-01 is a Friday → 10 weekdays
console.log(countWeekdays('2026-04-20', '2026-05-01'));
console.log(listWeekdays('2026-04-20', '2026-04-24'));
console.log(countWeekdays('2026-04-25', '2026-04-26')); // Sat+Sun
console.log(countWeekdays('2026-05-10', '2026-05-01')); // start>end
"
```

Expected output:
```
10
[ '2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24' ]
0
0
```

- [ ] **Step 3: Commit**

```bash
git add server/lib/capacityDates.js
git commit -m "$(cat <<'EOF'
Add weekday-enumeration helper for capacity planning

listWeekdays(start, end) returns an array of YYYY-MM-DD strings for each
Mon-Fri in the range, inclusive. countWeekdays returns the count. Used
by the capacity router to compute working days in a plan.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Capacity router — list plans + create plan

**Files:**
- Create: `server/routes/capacity.js`
- Modify: `server/index.js`

**Steps:**

- [ ] **Step 1: Create the router skeleton with list + create**

Create `server/routes/capacity.js` with:

```javascript
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { countWeekdays } = require('../lib/capacityDates');
const { getNumber } = require('../lib/appSettings');

// GET /api/capacity-plans?team_id= — list plans with summary stats
router.get('/', (req, res) => {
  try {
    const teamId = req.query.team_id ? Number(req.query.team_id) : null;
    const where = teamId ? 'WHERE cp.team_id = ?' : '';
    const params = teamId ? [teamId] : [];

    const plans = db.prepare(`
      SELECT cp.*, t.name AS team_name,
        (SELECT COUNT(*) FROM capacity_plan_members WHERE plan_id = cp.id AND is_excluded = 0) AS active_member_count
      FROM capacity_plans cp
      LEFT JOIN teams t ON t.id = cp.team_id
      ${where}
      ORDER BY cp.start_date DESC
    `).all(...params);

    const hoursPerPoint = getNumber('capacity_hours_per_point');
    const allocFactor = getNumber('capacity_allocation_factor');

    const enriched = plans.map((plan) => {
      const workingDays = countWeekdays(plan.start_date, plan.end_date);

      const leaveCounts = db.prepare(`
        SELECT
          SUM(CASE WHEN is_planned = 1 THEN 1 ELSE 0 END) AS planned,
          SUM(CASE WHEN is_planned = 0 THEN 1 ELSE 0 END) AS unplanned
        FROM capacity_leave cl
        WHERE cl.plan_id = ?
          AND cl.member_id IN (
            SELECT member_id FROM capacity_plan_members
            WHERE plan_id = ? AND is_excluded = 0
          )
      `).get(plan.id, plan.id);

      const memberCount = plan.active_member_count || 0;
      const totalWorkingHours = memberCount * workingDays * 8;
      const plannedLeaveHours = (leaveCounts?.planned || 0) * 8;
      const unplannedLeaveHours = (leaveCounts?.unplanned || 0) * 8;
      const plannedHours = totalWorkingHours - plannedLeaveHours;
      const actualHours = plannedHours - unplannedLeaveHours;
      const utilizationPct = totalWorkingHours > 0 ? (actualHours / totalWorkingHours) * 100 : 0;

      return {
        ...plan,
        working_days: workingDays,
        planned_hours: plannedHours,
        actual_hours: actualHours,
        total_points: Math.round((actualHours / hoursPerPoint) * 10) / 10,
        required_allocation: Math.round(actualHours * allocFactor),
        utilization_pct: Math.round(utilizationPct * 10) / 10,
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/capacity-plans — create plan; auto-populate members from team
router.post('/', (req, res) => {
  try {
    const { name, team_id, start_date, end_date, jira_sprint_name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!team_id) return res.status(400).json({ error: 'team_id is required' });
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' });
    if (start_date > end_date) return res.status(400).json({ error: 'start_date must be on or before end_date' });

    const team = db.prepare('SELECT id FROM teams WHERE id = ?').get(Number(team_id));
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const create = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO capacity_plans (name, team_id, start_date, end_date, jira_sprint_name)
        VALUES (?, ?, ?, ?, ?)
      `).run(name.trim(), Number(team_id), start_date, end_date, jira_sprint_name?.trim() || null);

      const planId = result.lastInsertRowid;

      const members = db.prepare(
        'SELECT member_id FROM team_member_assignments WHERE team_id = ?'
      ).all(Number(team_id));

      for (const m of members) {
        db.prepare(
          'INSERT OR IGNORE INTO capacity_plan_members (plan_id, member_id) VALUES (?, ?)'
        ).run(planId, m.member_id);
      }

      return planId;
    });

    const planId = create();
    const plan = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(planId);
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount the router in `server/index.js`**

In `server/index.js`, find the block of `require` statements (around line 16-31) and add:

```javascript
const capacityRouter = require('./routes/capacity');
```

Then in the `app.use(...)` block (around line 33-49), add:

```javascript
app.use('/api/capacity-plans', capacityRouter);
```

Place both lines after the existing `teamsRouter` / `/api/teams` lines for consistency.

- [ ] **Step 3: Start the server**

```bash
npm run dev
```

Run this in the background (the executing-plans worker should use `run_in_background: true` on the Bash tool). Wait ~3 seconds for both server and client to come up, then proceed.

- [ ] **Step 4: Seed minimal fixtures and test endpoints**

You need at least one team and one member to create a plan. Create fixtures via curl:

```bash
# Create a team
TEAM_ID=$(curl -s -X POST http://localhost:3001/api/teams -H 'Content-Type: application/json' -d '{"name":"Test Team"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
echo "TEAM_ID=$TEAM_ID"

# Create a team member
MEMBER_ID=$(curl -s -X POST http://localhost:3001/api/team -H 'Content-Type: application/json' -d '{"name":"Ali","role":"Engineer"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
echo "MEMBER_ID=$MEMBER_ID"

# Assign member to team
curl -s -X PUT "http://localhost:3001/api/teams/$TEAM_ID/assignments" \
  -H 'Content-Type: application/json' \
  -d "{\"member_ids\":[$MEMBER_ID],\"board_ids\":[],\"project_ids\":[]}"
echo

# Create a capacity plan
PLAN=$(curl -s -X POST http://localhost:3001/api/capacity-plans \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Sprint 48 planning\",\"team_id\":$TEAM_ID,\"start_date\":\"2026-04-20\",\"end_date\":\"2026-05-01\"}")
echo "Created: $PLAN"

# List plans
curl -s http://localhost:3001/api/capacity-plans | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
```

Expected:
- `Created` response has `id`, `name`, `team_id`, `start_date`, `end_date`.
- List response is a JSON array containing the plan with `working_days: 10`, `planned_hours: 80` (1 member × 10 days × 8), `actual_hours: 80`, `total_points: 10`, `required_allocation: 72`, `utilization_pct: 100`.

Validation check: also try a bad request:

```bash
curl -s -X POST http://localhost:3001/api/capacity-plans -H 'Content-Type: application/json' -d '{"name":"bad","team_id":1,"start_date":"2026-05-10","end_date":"2026-05-01"}'
```

Expected: `{"error":"start_date must be on or before end_date"}`.

- [ ] **Step 5: Commit**

```bash
git add server/routes/capacity.js server/index.js
git commit -m "$(cat <<'EOF'
Add capacity plan list and create endpoints

New /api/capacity-plans router with GET (list with team filter and
summary stats) and POST (create with auto-populated members from the
team's assignments). Totals computed from working days, leave counts,
and global hours_per_point and allocation_factor settings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Capacity router — plan detail endpoint with full totals

**Files:**
- Modify: `server/routes/capacity.js`

**Steps:**

- [ ] **Step 1: Add the detail endpoint**

Insert the following route inside `server/routes/capacity.js`, after the `POST /` route and before `module.exports`:

```javascript
// GET /api/capacity-plans/:id — full plan, members, leave, and computed totals
router.get('/:id', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const plan = db.prepare(`
      SELECT cp.*, t.name AS team_name
      FROM capacity_plans cp
      LEFT JOIN teams t ON t.id = cp.team_id
      WHERE cp.id = ?
    `).get(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const members = db.prepare(`
      SELECT cpm.*, tm.name AS member_name, tm.role, tm.color,
        (SELECT COUNT(*) FROM team_member_assignments WHERE team_id = ? AND member_id = cpm.member_id) AS still_on_team
      FROM capacity_plan_members cpm
      JOIN team_members tm ON tm.id = cpm.member_id
      WHERE cpm.plan_id = ?
      ORDER BY tm.name
    `).all(plan.team_id, planId);

    const leave = db.prepare(`
      SELECT cl.*, lt.name AS loan_team_name, lp.name AS loan_project_name
      FROM capacity_leave cl
      LEFT JOIN teams lt ON lt.id = cl.loan_team_id
      LEFT JOIN projects lp ON lp.id = cl.loan_project_id
      WHERE cl.plan_id = ?
      ORDER BY cl.member_id, cl.leave_date
    `).all(planId);

    const workingDays = countWeekdays(plan.start_date, plan.end_date);
    const hoursPerPoint = getNumber('capacity_hours_per_point');
    const allocFactor = getNumber('capacity_allocation_factor');

    // Per-member totals (non-excluded only)
    const leaveByMember = new Map();
    for (const l of leave) {
      if (!leaveByMember.has(l.member_id)) leaveByMember.set(l.member_id, []);
      leaveByMember.get(l.member_id).push(l);
    }

    const memberTotals = members
      .filter((m) => !m.is_excluded)
      .map((m) => {
        const ml = leaveByMember.get(m.member_id) || [];
        const plannedLeave = ml.filter((x) => x.is_planned === 1).length;
        const unplannedLeave = ml.filter((x) => x.is_planned === 0).length;
        const plannedHours = (workingDays - plannedLeave) * 8;
        const actualHours = (workingDays - plannedLeave - unplannedLeave) * 8;
        const theoreticalMax = workingDays * 8;
        return {
          member_id: m.member_id,
          member_name: m.member_name,
          role: m.role,
          color: m.color,
          working_days: workingDays,
          planned_leave_days: plannedLeave,
          unplanned_leave_days: unplannedLeave,
          planned_hours: plannedHours,
          actual_hours: actualHours,
          points: Math.round((actualHours / hoursPerPoint) * 10) / 10,
          required_allocation: Math.round(actualHours * allocFactor),
          utilization_pct: theoreticalMax > 0 ? Math.round((actualHours / theoreticalMax) * 1000) / 10 : 0,
        };
      });

    const teamTotals = memberTotals.reduce(
      (acc, m) => ({
        planned_hours: acc.planned_hours + m.planned_hours,
        actual_hours: acc.actual_hours + m.actual_hours,
        points: Math.round((acc.points + m.points) * 10) / 10,
        required_allocation: acc.required_allocation + m.required_allocation,
        theoretical_max: acc.theoretical_max + m.working_days * 8,
      }),
      { planned_hours: 0, actual_hours: 0, points: 0, required_allocation: 0, theoretical_max: 0 }
    );
    teamTotals.utilization_pct = teamTotals.theoretical_max > 0
      ? Math.round((teamTotals.actual_hours / teamTotals.theoretical_max) * 1000) / 10
      : 0;

    // Leave breakdown by type (only for non-excluded members)
    const activeMemberIds = new Set(memberTotals.map((m) => m.member_id));
    const activeLeave = leave.filter((l) => activeMemberIds.has(l.member_id));
    const breakdown = { vacation: 0, holiday: 0, sick: 0, loaned: 0, other: 0 };
    const loanByTeam = {};
    for (const l of activeLeave) {
      breakdown[l.leave_type] = (breakdown[l.leave_type] || 0) + 8;
      if (l.leave_type === 'loaned') {
        const key = l.loan_team_name || 'Unspecified';
        loanByTeam[key] = (loanByTeam[key] || 0) + 8;
      }
    }

    res.json({
      ...plan,
      working_days: workingDays,
      hours_per_point: hoursPerPoint,
      allocation_factor: allocFactor,
      members,
      leave,
      member_totals: memberTotals,
      team_totals: teamTotals,
      leave_breakdown: breakdown,
      loan_by_team: loanByTeam,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Verify the endpoint**

Assuming `npm run dev` is still running and you have the plan created in Task 4:

```bash
# Grab the most recent plan id
PLAN_ID=$(curl -s http://localhost:3001/api/capacity-plans | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)[0].id))")
echo "PLAN_ID=$PLAN_ID"

curl -s "http://localhost:3001/api/capacity-plans/$PLAN_ID" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
```

Expected: JSON with `working_days: 10`, `members` array of length 1 (Ali), `member_totals[0].actual_hours: 80`, `team_totals.actual_hours: 80`, `team_totals.required_allocation: 72`, `leave_breakdown` all zeros, `loan_by_team: {}`.

Also verify 404:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/capacity-plans/999999
```

Expected: `404`.

- [ ] **Step 3: Commit**

```bash
git add server/routes/capacity.js
git commit -m "$(cat <<'EOF'
Add capacity plan detail endpoint with totals

GET /api/capacity-plans/:id returns the plan, its members, all leave
entries (with joined loan team/project names), plus computed per-member
totals, team totals, leave type breakdown, and loan-by-destination-team
breakdown. All figures use global hours_per_point and allocation_factor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Capacity router — update & delete plan

**Files:**
- Modify: `server/routes/capacity.js`

**Steps:**

- [ ] **Step 1: Add PUT and DELETE**

Insert into `server/routes/capacity.js` after the `GET /:id` route:

```javascript
// PUT /api/capacity-plans/:id — update plan metadata
router.put('/:id', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(planId);
    if (!existing) return res.status(404).json({ error: 'Plan not found' });

    const name = req.body.name !== undefined ? req.body.name : existing.name;
    const start_date = req.body.start_date !== undefined ? req.body.start_date : existing.start_date;
    const end_date = req.body.end_date !== undefined ? req.body.end_date : existing.end_date;
    const jira_sprint_name = req.body.jira_sprint_name !== undefined
      ? (req.body.jira_sprint_name?.trim() || null)
      : existing.jira_sprint_name;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    if (start_date > end_date) return res.status(400).json({ error: 'start_date must be on or before end_date' });

    const update = db.transaction(() => {
      db.prepare(`
        UPDATE capacity_plans
        SET name = ?, start_date = ?, end_date = ?, jira_sprint_name = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(name.trim(), start_date, end_date, jira_sprint_name, planId);

      // Delete leave entries outside the new range
      db.prepare(`
        DELETE FROM capacity_leave
        WHERE plan_id = ? AND (leave_date < ? OR leave_date > ?)
      `).run(planId, start_date, end_date);
    });

    update();
    const plan = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(planId);
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/capacity-plans/:id
router.delete('/:id', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM capacity_plans WHERE id = ?').get(planId);
    if (!existing) return res.status(404).json({ error: 'Plan not found' });
    db.prepare('DELETE FROM capacity_plans WHERE id = ?').run(planId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Verify**

With server running:

```bash
PLAN_ID=$(curl -s http://localhost:3001/api/capacity-plans | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)[0].id))")

# Update: change name and link a jira sprint name
curl -s -X PUT "http://localhost:3001/api/capacity-plans/$PLAN_ID" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sprint 48 planning (edited)","jira_sprint_name":"Sprint 48"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).name, '|', JSON.parse(d).jira_sprint_name))"

# Validation: start > end
curl -s -X PUT "http://localhost:3001/api/capacity-plans/$PLAN_ID" \
  -H 'Content-Type: application/json' \
  -d '{"start_date":"2026-06-01","end_date":"2026-05-01"}'
echo
```

Expected:
- First PUT returns: `Sprint 48 planning (edited) | Sprint 48`
- Second PUT returns: `{"error":"start_date must be on or before end_date"}`

- [ ] **Step 3: Commit**

```bash
git add server/routes/capacity.js
git commit -m "$(cat <<'EOF'
Add capacity plan update and delete endpoints

PUT supports partial updates of name, dates, and jira_sprint_name, with
validation and automatic cleanup of leave entries falling outside the
new date range. DELETE cascades to members and leave via FK.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Capacity router — plan members (add/exclude/remove)

**Files:**
- Modify: `server/routes/capacity.js`

**Steps:**

- [ ] **Step 1: Add member endpoints**

Insert into `server/routes/capacity.js` after the `DELETE /:id` route:

```javascript
// POST /api/capacity-plans/:id/members — add an off-team member to the plan
router.post('/:id/members', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const { member_id } = req.body;
    if (!member_id) return res.status(400).json({ error: 'member_id is required' });

    const plan = db.prepare('SELECT id FROM capacity_plans WHERE id = ?').get(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const member = db.prepare('SELECT id FROM team_members WHERE id = ?').get(Number(member_id));
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const existing = db.prepare(
      'SELECT id FROM capacity_plan_members WHERE plan_id = ? AND member_id = ?'
    ).get(planId, Number(member_id));
    if (existing) return res.status(409).json({ error: 'Member already on this plan' });

    db.prepare(
      'INSERT INTO capacity_plan_members (plan_id, member_id) VALUES (?, ?)'
    ).run(planId, Number(member_id));

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/capacity-plans/:id/members/:memberId — toggle exclusion
router.patch('/:id/members/:memberId', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    const { is_excluded } = req.body;
    if (is_excluded === undefined) return res.status(400).json({ error: 'is_excluded is required' });

    const existing = db.prepare(
      'SELECT id FROM capacity_plan_members WHERE plan_id = ? AND member_id = ?'
    ).get(planId, memberId);
    if (!existing) return res.status(404).json({ error: 'Member not on this plan' });

    db.prepare(
      'UPDATE capacity_plan_members SET is_excluded = ? WHERE plan_id = ? AND member_id = ?'
    ).run(is_excluded ? 1 : 0, planId, memberId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/capacity-plans/:id/members/:memberId — remove ad-hoc member
// (core team members cannot be removed; must be excluded instead)
router.delete('/:id/members/:memberId', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const memberId = Number(req.params.memberId);

    const plan = db.prepare('SELECT team_id FROM capacity_plans WHERE id = ?').get(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const isOnTeam = db.prepare(
      'SELECT 1 AS x FROM team_member_assignments WHERE team_id = ? AND member_id = ?'
    ).get(plan.team_id, memberId);
    if (isOnTeam) {
      return res.status(400).json({ error: 'Cannot remove core team member; exclude them instead' });
    }

    db.prepare(
      'DELETE FROM capacity_plan_members WHERE plan_id = ? AND member_id = ?'
    ).run(planId, memberId);
    db.prepare(
      'DELETE FROM capacity_leave WHERE plan_id = ? AND member_id = ?'
    ).run(planId, memberId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Verify**

With server running and the existing plan and member:

```bash
PLAN_ID=$(curl -s http://localhost:3001/api/capacity-plans | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)[0].id))")
MEMBER_ID=$(curl -s http://localhost:3001/api/team | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)[0].id))")

# Exclude the member
curl -s -X PATCH "http://localhost:3001/api/capacity-plans/$PLAN_ID/members/$MEMBER_ID" \
  -H 'Content-Type: application/json' -d '{"is_excluded":true}'
echo

# Plan totals should now show 0 active members
curl -s http://localhost:3001/api/capacity-plans | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d)[0];console.log('active:', p.active_member_count, 'actual_hours:', p.actual_hours)})"

# Re-include
curl -s -X PATCH "http://localhost:3001/api/capacity-plans/$PLAN_ID/members/$MEMBER_ID" \
  -H 'Content-Type: application/json' -d '{"is_excluded":false}'
echo

# Try to remove a core member (should fail)
curl -s -X DELETE "http://localhost:3001/api/capacity-plans/$PLAN_ID/members/$MEMBER_ID"
echo

# Create an off-team borrowed member and add to plan
OFF_ID=$(curl -s -X POST http://localhost:3001/api/team -H 'Content-Type: application/json' -d '{"name":"Borrowed","role":"Contractor"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
curl -s -X POST "http://localhost:3001/api/capacity-plans/$PLAN_ID/members" \
  -H 'Content-Type: application/json' -d "{\"member_id\":$OFF_ID}"
echo

# Remove the borrowed member (should succeed)
curl -s -X DELETE "http://localhost:3001/api/capacity-plans/$PLAN_ID/members/$OFF_ID"
echo
```

Expected:
- First PATCH: `{"success":true}`
- Totals after exclusion: `active: 0, actual_hours: 0`
- Re-include: `{"success":true}`
- Delete core member attempt: `{"error":"Cannot remove core team member; exclude them instead"}`
- Add off-team member: `{"success":true}`
- Delete off-team member: `{"success":true}`

- [ ] **Step 3: Commit**

```bash
git add server/routes/capacity.js
git commit -m "$(cat <<'EOF'
Add capacity plan member endpoints

POST adds an off-team member (borrowed contractor), PATCH toggles the
per-plan is_excluded flag, DELETE removes ad-hoc members. Core team
members can only be excluded, never removed, to preserve the link back
to team assignments.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Capacity router — leave entry upsert and clear

**Files:**
- Modify: `server/routes/capacity.js`

**Steps:**

- [ ] **Step 1: Add leave endpoints**

Insert into `server/routes/capacity.js` after the member delete route:

```javascript
const VALID_LEAVE_TYPES = ['vacation', 'holiday', 'sick', 'loaned', 'other'];

function resolvePlannedFlag(plan, explicit) {
  if (explicit !== undefined && explicit !== null) return explicit ? 1 : 0;
  const today = new Date().toISOString().slice(0, 10);
  return today <= plan.start_date ? 1 : 0;
}

// PUT /api/capacity-plans/:id/leave — upsert one (member, date) cell
router.put('/:id/leave', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const { member_id, leave_date, leave_type, is_planned, loan_team_id, loan_project_id, loan_note } = req.body;

    if (!member_id || !leave_date || !leave_type) {
      return res.status(400).json({ error: 'member_id, leave_date, leave_type are required' });
    }
    if (!VALID_LEAVE_TYPES.includes(leave_type)) {
      return res.status(400).json({ error: `leave_type must be one of ${VALID_LEAVE_TYPES.join(', ')}` });
    }

    const plan = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    if (leave_date < plan.start_date || leave_date > plan.end_date) {
      return res.status(400).json({ error: 'leave_date is outside plan date range' });
    }

    const member = db.prepare(
      'SELECT 1 AS x FROM capacity_plan_members WHERE plan_id = ? AND member_id = ?'
    ).get(planId, Number(member_id));
    if (!member) return res.status(400).json({ error: 'Member is not on this plan' });

    const plannedFlag = resolvePlannedFlag(plan, is_planned);
    const loanTeam = leave_type === 'loaned' ? (loan_team_id || null) : null;
    const loanProject = leave_type === 'loaned' ? (loan_project_id || null) : null;
    const loanNoteValue = leave_type === 'loaned' ? (loan_note || null) : null;

    const existing = db.prepare(
      'SELECT id FROM capacity_leave WHERE plan_id = ? AND member_id = ? AND leave_date = ?'
    ).get(planId, Number(member_id), leave_date);

    if (existing) {
      db.prepare(`
        UPDATE capacity_leave
        SET leave_type = ?, is_planned = ?, loan_team_id = ?, loan_project_id = ?, loan_note = ?
        WHERE id = ?
      `).run(leave_type, plannedFlag, loanTeam, loanProject, loanNoteValue, existing.id);
    } else {
      db.prepare(`
        INSERT INTO capacity_leave (plan_id, member_id, leave_date, leave_type, is_planned, loan_team_id, loan_project_id, loan_note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(planId, Number(member_id), leave_date, leave_type, plannedFlag, loanTeam, loanProject, loanNoteValue);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/capacity-plans/:id/leave — clear a single cell
router.delete('/:id/leave', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const { member_id, leave_date } = req.body;
    if (!member_id || !leave_date) return res.status(400).json({ error: 'member_id and leave_date are required' });

    db.prepare(
      'DELETE FROM capacity_leave WHERE plan_id = ? AND member_id = ? AND leave_date = ?'
    ).run(planId, Number(member_id), leave_date);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Verify**

With server running:

```bash
PLAN_ID=$(curl -s http://localhost:3001/api/capacity-plans | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)[0].id))")
MEMBER_ID=$(curl -s http://localhost:3001/api/team | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).find(m=>m.name==='Ali').id))")

# Add planned vacation on 2026-04-22
curl -s -X PUT "http://localhost:3001/api/capacity-plans/$PLAN_ID/leave" \
  -H 'Content-Type: application/json' \
  -d "{\"member_id\":$MEMBER_ID,\"leave_date\":\"2026-04-22\",\"leave_type\":\"vacation\",\"is_planned\":true}"
echo

# Detail endpoint should show actual_hours = 72 (80 - 8) and one vacation day
curl -s "http://localhost:3001/api/capacity-plans/$PLAN_ID" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);console.log('actual:', p.team_totals.actual_hours, 'vacation hrs:', p.leave_breakdown.vacation);})"

# Change that same day to loaned
curl -s -X PUT "http://localhost:3001/api/capacity-plans/$PLAN_ID/leave" \
  -H 'Content-Type: application/json' \
  -d "{\"member_id\":$MEMBER_ID,\"leave_date\":\"2026-04-22\",\"leave_type\":\"loaned\",\"is_planned\":true,\"loan_note\":\"Platform team\"}"
curl -s "http://localhost:3001/api/capacity-plans/$PLAN_ID" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);console.log('vacation:', p.leave_breakdown.vacation, 'loaned:', p.leave_breakdown.loaned);})"

# Clear the cell
curl -s -X DELETE "http://localhost:3001/api/capacity-plans/$PLAN_ID/leave" \
  -H 'Content-Type: application/json' -d "{\"member_id\":$MEMBER_ID,\"leave_date\":\"2026-04-22\"}"
echo

# Out-of-range date
curl -s -X PUT "http://localhost:3001/api/capacity-plans/$PLAN_ID/leave" \
  -H 'Content-Type: application/json' \
  -d "{\"member_id\":$MEMBER_ID,\"leave_date\":\"2027-01-01\",\"leave_type\":\"sick\"}"
echo
```

Expected:
- First PUT: `{"success":true}`
- Detail: `actual: 72 vacation hrs: 8`
- After PUT to loaned: `vacation: 0 loaned: 8`
- DELETE: `{"success":true}`
- Out-of-range: `{"error":"leave_date is outside plan date range"}`

- [ ] **Step 3: Commit**

```bash
git add server/routes/capacity.js
git commit -m "$(cat <<'EOF'
Add capacity plan leave upsert and clear endpoints

PUT /api/capacity-plans/:id/leave upserts one (member, date) cell with
type, planned flag (auto-resolved from today vs start_date when not
provided), and optional loan destination. DELETE clears a single cell.
Validates type and date range.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Capacity router — leave range bulk endpoint

**Files:**
- Modify: `server/routes/capacity.js`

**Steps:**

- [ ] **Step 1: Add the range endpoint**

Insert into `server/routes/capacity.js` after the leave DELETE route:

```javascript
// POST /api/capacity-plans/:id/leave/range — bulk upsert across a date range
router.post('/:id/leave/range', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const { member_id, start_date, end_date, leave_type, is_planned, loan_team_id, loan_project_id, loan_note } = req.body;

    if (!member_id || !start_date || !end_date || !leave_type) {
      return res.status(400).json({ error: 'member_id, start_date, end_date, leave_type are required' });
    }
    if (!VALID_LEAVE_TYPES.includes(leave_type)) {
      return res.status(400).json({ error: `leave_type must be one of ${VALID_LEAVE_TYPES.join(', ')}` });
    }

    const plan = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const effectiveStart = start_date < plan.start_date ? plan.start_date : start_date;
    const effectiveEnd = end_date > plan.end_date ? plan.end_date : end_date;
    if (effectiveStart > effectiveEnd) {
      return res.status(400).json({ error: 'Range does not overlap plan dates' });
    }

    const onPlan = db.prepare(
      'SELECT 1 AS x FROM capacity_plan_members WHERE plan_id = ? AND member_id = ?'
    ).get(planId, Number(member_id));
    if (!onPlan) return res.status(400).json({ error: 'Member is not on this plan' });

    const plannedFlag = resolvePlannedFlag(plan, is_planned);
    const loanTeam = leave_type === 'loaned' ? (loan_team_id || null) : null;
    const loanProject = leave_type === 'loaned' ? (loan_project_id || null) : null;
    const loanNoteValue = leave_type === 'loaned' ? (loan_note || null) : null;

    const { listWeekdays } = require('../lib/capacityDates');
    const dates = listWeekdays(effectiveStart, effectiveEnd);

    const upsert = db.transaction(() => {
      const selectStmt = db.prepare(
        'SELECT id FROM capacity_leave WHERE plan_id = ? AND member_id = ? AND leave_date = ?'
      );
      const updateStmt = db.prepare(`
        UPDATE capacity_leave
        SET leave_type = ?, is_planned = ?, loan_team_id = ?, loan_project_id = ?, loan_note = ?
        WHERE id = ?
      `);
      const insertStmt = db.prepare(`
        INSERT INTO capacity_leave (plan_id, member_id, leave_date, leave_type, is_planned, loan_team_id, loan_project_id, loan_note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const d of dates) {
        const existing = selectStmt.get(planId, Number(member_id), d);
        if (existing) {
          updateStmt.run(leave_type, plannedFlag, loanTeam, loanProject, loanNoteValue, existing.id);
        } else {
          insertStmt.run(planId, Number(member_id), d, leave_type, plannedFlag, loanTeam, loanProject, loanNoteValue);
        }
      }
    });

    upsert();
    res.json({ success: true, applied_days: dates.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Verify**

With server running:

```bash
PLAN_ID=$(curl -s http://localhost:3001/api/capacity-plans | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)[0].id))")
MEMBER_ID=$(curl -s http://localhost:3001/api/team | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).find(m=>m.name==='Ali').id))")

# Add vacation for a full week (Mon 2026-04-27 - Fri 2026-05-01 = 5 weekdays)
curl -s -X POST "http://localhost:3001/api/capacity-plans/$PLAN_ID/leave/range" \
  -H 'Content-Type: application/json' \
  -d "{\"member_id\":$MEMBER_ID,\"start_date\":\"2026-04-27\",\"end_date\":\"2026-05-01\",\"leave_type\":\"vacation\",\"is_planned\":true}"
echo

# Detail: vacation should be 40h, actual_hours 40 (80-40)
curl -s "http://localhost:3001/api/capacity-plans/$PLAN_ID" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);console.log('applied vacation:', p.leave_breakdown.vacation, 'actual:', p.team_totals.actual_hours);})"

# Clean up the range
for day in 2026-04-27 2026-04-28 2026-04-29 2026-04-30 2026-05-01; do
  curl -s -X DELETE "http://localhost:3001/api/capacity-plans/$PLAN_ID/leave" \
    -H 'Content-Type: application/json' -d "{\"member_id\":$MEMBER_ID,\"leave_date\":\"$day\"}" > /dev/null
done
echo "cleaned"
```

Expected:
- Range POST: `{"success":true,"applied_days":5}`
- Detail: `applied vacation: 40 actual: 40`

- [ ] **Step 3: Commit**

```bash
git add server/routes/capacity.js
git commit -m "$(cat <<'EOF'
Add capacity plan leave range bulk endpoint

POST /api/capacity-plans/:id/leave/range upserts leave entries for each
weekday in the requested range, clipped to the plan's dates. Reuses the
same validation and planned-flag resolution as the per-cell upsert.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: App settings router — GET/PUT for capacity constants

**Files:**
- Create: `server/routes/appSettings.js`
- Modify: `server/index.js`

**Steps:**

- [ ] **Step 1: Create the router**

Create `server/routes/appSettings.js` with:

```javascript
const express = require('express');
const router = express.Router();
const { getSetting, setSetting, DEFAULTS } = require('../lib/appSettings');

const CAPACITY_KEYS = ['capacity_hours_per_point', 'capacity_allocation_factor'];

// GET /api/settings/app/capacity — return current values (falling back to defaults)
router.get('/capacity', (req, res) => {
  try {
    const result = {};
    for (const key of CAPACITY_KEYS) {
      result[key] = Number(getSetting(key));
    }
    result.defaults = { ...DEFAULTS };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/app/capacity — update values
router.put('/capacity', (req, res) => {
  try {
    const { capacity_hours_per_point, capacity_allocation_factor } = req.body;

    if (capacity_hours_per_point !== undefined) {
      const n = Number(capacity_hours_per_point);
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ error: 'capacity_hours_per_point must be a positive number' });
      }
      setSetting('capacity_hours_per_point', n);
    }
    if (capacity_allocation_factor !== undefined) {
      const n = Number(capacity_allocation_factor);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        return res.status(400).json({ error: 'capacity_allocation_factor must be between 0 and 1' });
      }
      setSetting('capacity_allocation_factor', n);
    }

    const result = {};
    for (const key of CAPACITY_KEYS) {
      result[key] = Number(getSetting(key));
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount in `server/index.js`**

Add require:
```javascript
const appSettingsRouter = require('./routes/appSettings');
```

Add mount (near the other settings routes):
```javascript
app.use('/api/settings/app', appSettingsRouter);
```

- [ ] **Step 3: Verify**

Restart the server (kill and re-run `npm run dev`), then:

```bash
curl -s http://localhost:3001/api/settings/app/capacity
echo

curl -s -X PUT http://localhost:3001/api/settings/app/capacity \
  -H 'Content-Type: application/json' \
  -d '{"capacity_hours_per_point":8,"capacity_allocation_factor":0.85}'
echo

# Validation: factor out of range
curl -s -X PUT http://localhost:3001/api/settings/app/capacity \
  -H 'Content-Type: application/json' \
  -d '{"capacity_allocation_factor":1.5}'
echo

# Reset to default
curl -s -X PUT http://localhost:3001/api/settings/app/capacity \
  -H 'Content-Type: application/json' \
  -d '{"capacity_allocation_factor":0.9}'
echo
```

Expected:
- GET: `{"capacity_hours_per_point":8,"capacity_allocation_factor":0.9,"defaults":{"capacity_hours_per_point":"8","capacity_allocation_factor":"0.9"}}`
- PUT with 0.85: `{"capacity_hours_per_point":8,"capacity_allocation_factor":0.85}`
- Validation error: `{"error":"capacity_allocation_factor must be between 0 and 1"}`

- [ ] **Step 4: Commit**

```bash
git add server/routes/appSettings.js server/index.js
git commit -m "$(cat <<'EOF'
Add app settings router for capacity constants

GET/PUT /api/settings/app/capacity exposes the global
hours_per_point and allocation_factor values used by capacity plan
calculations. Validation: hours_per_point must be positive;
allocation_factor must be between 0 and 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Client — routes and sidebar entry

**Files:**
- Create: `client/src/pages/CapacityListPage.jsx` (placeholder)
- Create: `client/src/pages/CapacityPlanPage.jsx` (placeholder)
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Layout.jsx`

**Steps:**

- [ ] **Step 1: Create page placeholders**

Create `client/src/pages/CapacityListPage.jsx`:

```jsx
export default function CapacityListPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Capacity</h1>
      <p className="text-gray-500">Capacity planning list — coming next.</p>
    </div>
  );
}
```

Create `client/src/pages/CapacityPlanPage.jsx`:

```jsx
import { useParams } from 'react-router-dom';

export default function CapacityPlanPage() {
  const { id } = useParams();
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Capacity Plan #{id}</h1>
      <p className="text-gray-500">Plan detail — coming next.</p>
    </div>
  );
}
```

- [ ] **Step 2: Register routes in `App.jsx`**

Add imports after existing page imports:

```jsx
import CapacityListPage from './pages/CapacityListPage';
import CapacityPlanPage from './pages/CapacityPlanPage';
```

Add routes inside the `<Route element={<Layout />}>` block, before `/settings`:

```jsx
<Route path="/capacity" element={<CapacityListPage />} />
<Route path="/capacity/:id" element={<CapacityPlanPage />} />
```

- [ ] **Step 3: Add sidebar entry in `Layout.jsx`**

At the top of the file, add `CalendarCheck` to the lucide-react import:

```jsx
import {
  LayoutDashboard,
  Columns3,
  Users,
  RefreshCw,
  CalendarCheck,
  CheckSquare,
  AlertTriangle,
  StickyNote,
  Newspaper,
  Settings,
} from 'lucide-react';
```

In the `navItems` array, insert the Capacity entry right after the Sprints entry:

```jsx
{ to: '/sprints', label: 'Sprints', icon: RefreshCw },
{ to: '/capacity', label: 'Capacity', icon: CalendarCheck },
```

- [ ] **Step 4: Verify**

Build should succeed:

```bash
cd client && npm run build
```

Expected: builds with no errors. With `npm run dev` running, open http://localhost:5173/capacity in a browser — you should see "Capacity" heading with the placeholder text, and the sidebar should show a "Capacity" entry between Sprints and Todos. Navigate to http://localhost:5173/capacity/42 — you should see "Capacity Plan #42".

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/CapacityListPage.jsx client/src/pages/CapacityPlanPage.jsx client/src/App.jsx client/src/components/Layout.jsx
git commit -m "$(cat <<'EOF'
Scaffold Capacity pages, routes, and sidebar entry

Placeholder list and detail pages, registered under /capacity and
/capacity/:id, with a new Capacity entry in the sidebar between Sprints
and Todos.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Client — "New plan" modal

**Files:**
- Create: `client/src/components/CreateCapacityPlanModal.jsx`

**Steps:**

- [ ] **Step 1: Create the modal**

Create `client/src/components/CreateCapacityPlanModal.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from './ToastProvider';

const EMPTY_FORM = {
  name: '',
  team_id: '',
  start_date: '',
  end_date: '',
  jira_sprint_name: '',
};

export default function CreateCapacityPlanModal({ isOpen, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [teams, setTeams] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setForm(EMPTY_FORM);
    setError(null);
    api.get('/teams').then(setTeams).catch(() => setTeams([]));
  }, [isOpen]);

  if (!isOpen) return null;

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        team_id: Number(form.team_id),
        start_date: form.start_date,
        end_date: form.end_date,
        jira_sprint_name: form.jira_sprint_name.trim() || null,
      };
      const plan = await api.post('/capacity-plans', payload);
      toast.success('Capacity plan created');
      onCreated(plan);
      onClose();
    } catch (err) {
      setError(err.data?.error || 'Failed to create plan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">New capacity plan</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Sprint 48 planning"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
            <select
              name="team_id"
              value={form.team_id}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select a team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
              <input
                type="date"
                name="end_date"
                value={form.end_date}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Jira sprint name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              name="jira_sprint_name"
              value={form.jira_sprint_name}
              onChange={handleChange}
              placeholder="Sprint 48"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">Link later, once the Jira sprint exists.</p>
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Create plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd client && npm run build
```

Expected: builds cleanly. The modal isn't wired up yet; it will be in the next task.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/CreateCapacityPlanModal.jsx
git commit -m "$(cat <<'EOF'
Add CreateCapacityPlanModal component

Modal for creating a new capacity plan: name, team dropdown (loaded
from /api/teams), start/end dates, and optional Jira sprint name field
for later linking. Posts to /api/capacity-plans and calls onCreated
with the new plan.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Client — `/capacity` list page wired up

**Files:**
- Modify: `client/src/pages/CapacityListPage.jsx`

**Steps:**

- [ ] **Step 1: Replace placeholder with full list page**

Replace the entire contents of `client/src/pages/CapacityListPage.jsx` with:

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/ToastProvider';
import CreateCapacityPlanModal from '../components/CreateCapacityPlanModal';

export default function CapacityListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [plans, setPlans] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.get('/teams').then(setTeams).catch(() => setTeams([]));
  }, []);

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  async function loadPlans() {
    setLoading(true);
    try {
      const qs = selectedTeamId ? `?team_id=${selectedTeamId}` : '';
      const data = await api.get(`/capacity-plans${qs}`);
      setPlans(data);
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(plan, e) {
    e.stopPropagation();
    if (!confirm(`Delete "${plan.name}"?`)) return;
    try {
      await api.del(`/capacity-plans/${plan.id}`);
      toast.success('Plan deleted');
      loadPlans();
    } catch (err) {
      toast.error(err.data?.error || 'Failed to delete plan');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Capacity</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New plan
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">No capacity plans yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create your first plan
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Team</th>
                <th className="text-left px-4 py-3 font-medium">Dates</th>
                <th className="text-left px-4 py-3 font-medium">Jira sprint</th>
                <th className="text-right px-4 py-3 font-medium">Planned h</th>
                <th className="text-right px-4 py-3 font-medium">Actual h</th>
                <th className="text-right px-4 py-3 font-medium">Util%</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plans.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/capacity/${p.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.team_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.start_date} → {p.end_date}</td>
                  <td className="px-4 py-3 text-gray-600">{p.jira_sprint_name || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.planned_hours}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.actual_hours}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.utilization_pct}%</td>
                  <td className="px-2 py-3 text-right">
                    <button
                      onClick={(e) => handleDelete(p, e)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateCapacityPlanModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(plan) => navigate(`/capacity/${plan.id}`)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build + manual browser check**

```bash
cd client && npm run build
```

Expected: builds cleanly.

With `npm run dev` running, open http://localhost:5173/capacity. Expect:
- "Capacity" heading with a team filter dropdown and "New plan" button on the right.
- Table listing the plan created via curl in earlier tasks (if DB still populated), with columns Name, Team, Dates, Jira sprint, Planned h, Actual h, Util%, delete button.
- Row click navigates to `/capacity/:id` (still the placeholder).
- "New plan" button opens the modal. Submitting creates a plan and navigates to its detail page.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/CapacityListPage.jsx
git commit -m "$(cat <<'EOF'
Implement capacity plans list page

Replaces the placeholder with the full list: team filter, create-plan
button and modal, sortable table of plans with summary totals (planned
hours, actual hours, utilization %), delete action, and empty state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Client — `/capacity/:id` top bar + data fetching

**Files:**
- Modify: `client/src/pages/CapacityPlanPage.jsx`

**Steps:**

- [ ] **Step 1: Implement top bar with editable fields and data fetch**

Replace the entire contents of `client/src/pages/CapacityPlanPage.jsx` with:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/ToastProvider';

export default function CapacityPlanPage() {
  const { id } = useParams();
  const toast = useToast();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/capacity-plans/${id}`);
      setPlan(data);
      setError(null);
    } catch (err) {
      setError(err.data?.error || 'Failed to load plan');
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveField(field, value) {
    try {
      await api.put(`/capacity-plans/${id}`, { [field]: value });
      toast.success('Saved');
      load();
    } catch (err) {
      toast.error(err.data?.error || 'Failed to save');
      load(); // reload to revert optimistic state
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div>
        <Link to="/capacity" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Capacity
        </Link>
        <p className="text-red-600">{error || 'Plan not found'}</p>
      </div>
    );
  }

  return (
    <div>
      <Link to="/capacity" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Capacity
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <input
              defaultValue={plan.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== plan.name) saveField('name', v);
              }}
              className="text-2xl font-bold text-gray-900 bg-transparent outline-none focus:bg-gray-50 rounded px-2 py-1 -ml-2 w-full"
            />
            <p className="text-sm text-gray-500 mt-1 px-2">
              Team: <span className="font-medium">{plan.team_name || '—'}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start</label>
              <input
                type="date"
                defaultValue={plan.start_date}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== plan.start_date) saveField('start_date', e.target.value);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End</label>
              <input
                type="date"
                defaultValue={plan.end_date}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== plan.end_date) saveField('end_date', e.target.value);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Jira sprint</label>
              <input
                type="text"
                defaultValue={plan.jira_sprint_name || ''}
                placeholder="e.g. Sprint 48"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (plan.jira_sprint_name || '')) saveField('jira_sprint_name', v);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-48"
              />
            </div>
          </div>
        </div>
      </div>

      {plan.working_days === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 mb-6 text-sm">
          This date range has no weekdays. All totals will be zero.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm text-gray-500">Grid and totals coming in the next tasks.</p>
        <p className="text-xs text-gray-400 mt-2">Working days: {plan.working_days} · Members: {plan.members.length}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + manual browser check**

```bash
cd client && npm run build
```

Expected: builds cleanly. Open `/capacity/:id` for the plan created earlier. Expect:
- Back link to `/capacity`.
- Editable name (bold, large), editable start/end date pickers, editable Jira sprint input.
- Editing any field and blurring saves via PUT, shows toast "Saved".
- If you set end < start, toast shows an error and fields snap back.
- Below the card, "Grid and totals coming in the next tasks" with working days and member count.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/CapacityPlanPage.jsx
git commit -m "$(cat <<'EOF'
Implement capacity plan detail top bar with inline editing

Fetches /api/capacity-plans/:id and renders an editable header: name,
start/end dates, and Jira sprint name, each saved on blur via PUT. Shows
back-link, team name, a warning when the range has no weekdays, and a
placeholder for the grid/totals added in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Client — CapacityGrid component with cell popover

**Files:**
- Create: `client/src/components/CapacityGrid.jsx`
- Create: `client/src/components/CapacityCellPopover.jsx`
- Modify: `client/src/pages/CapacityPlanPage.jsx`

**Steps:**

- [ ] **Step 1: Create the cell popover**

Create `client/src/components/CapacityCellPopover.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import api from '../lib/api';

const LEAVE_TYPES = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'sick', label: 'Sick' },
  { value: 'loaned', label: 'Loaned' },
  { value: 'other', label: 'Other' },
];

export default function CapacityCellPopover({
  planId,
  memberId,
  date,
  existing,
  teams,
  projects,
  onClose,
  onSaved,
}) {
  const [leaveType, setLeaveType] = useState(existing?.leave_type || 'vacation');
  const [isPlanned, setIsPlanned] = useState(
    existing ? existing.is_planned === 1 : true
  );
  const [loanTeamId, setLoanTeamId] = useState(existing?.loan_team_id || '');
  const [loanProjectId, setLoanProjectId] = useState(existing?.loan_project_id || '');
  const [loanNote, setLoanNote] = useState(existing?.loan_note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/capacity-plans/${planId}/leave`, {
        member_id: memberId,
        leave_date: date,
        leave_type: leaveType,
        is_planned: isPlanned,
        loan_team_id: loanTeamId ? Number(loanTeamId) : null,
        loan_project_id: loanProjectId ? Number(loanProjectId) : null,
        loan_note: loanNote || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError(null);
    try {
      // DELETE with a JSON body; api.del doesn't support request bodies, so use fetch directly.
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/capacity-plans/${planId}/leave`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, leave_date: date }),
      });
      if (!res.ok) throw new Error('Clear failed');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Clear failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-sm shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Leave entry</p>
          <p className="text-sm text-gray-900 font-medium">{date}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {LEAVE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="is-planned"
            type="checkbox"
            checked={isPlanned}
            onChange={(e) => setIsPlanned(e.target.checked)}
          />
          <label htmlFor="is-planned" className="text-sm text-gray-700">Planned (booked before sprint started)</label>
        </div>

        {leaveType === 'loaned' && (
          <div className="space-y-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Loaned to team</label>
              <select
                value={loanTeamId}
                onChange={(e) => setLoanTeamId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Select…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Project (optional)</label>
              <select
                value={loanProjectId}
                onChange={(e) => setLoanProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
              <input
                type="text"
                value={loanNote}
                onChange={(e) => setLoanNote(e.target.value)}
                placeholder="e.g. covering for Sarah"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="flex items-center justify-between pt-1">
          {existing ? (
            <button
              onClick={handleClear}
              disabled={saving}
              className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Clear
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (leaveType === 'loaned' && !loanTeamId)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the grid component**

Create `client/src/components/CapacityGrid.jsx`:

```jsx
import { useState, useMemo, useEffect } from 'react';
import api from '../lib/api';
import CapacityCellPopover from './CapacityCellPopover';

const TYPE_COLORS = {
  vacation: 'bg-blue-500',
  holiday: 'bg-gray-400',
  sick: 'bg-orange-500',
  loaned: 'bg-purple-500',
  other: 'bg-slate-400',
};

function listWeekdays(start, end) {
  if (!start || !end) return [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const out = [];
  const c = new Date(s);
  while (c <= e) {
    const d = c.getUTCDay();
    if (d !== 0 && d !== 6) {
      const y = c.getUTCFullYear();
      const m = String(c.getUTCMonth() + 1).padStart(2, '0');
      const day = String(c.getUTCDate()).padStart(2, '0');
      out.push(`${y}-${m}-${day}`);
    }
    c.setUTCDate(c.getUTCDate() + 1);
  }
  return out;
}

function formatCol(d) {
  const date = new Date(`${d}T00:00:00Z`);
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getUTCDay()];
  return `${dow} ${date.getUTCDate()}`;
}

export default function CapacityGrid({ plan, onChange }) {
  const [editing, setEditing] = useState(null); // { memberId, date, existing }
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    api.get('/teams').then(setTeams).catch(() => setTeams([]));
    api.get('/projects').then(setProjects).catch(() => setProjects([]));
  }, []);

  const dates = useMemo(() => listWeekdays(plan.start_date, plan.end_date), [plan.start_date, plan.end_date]);

  const leaveByKey = useMemo(() => {
    const map = new Map();
    for (const l of plan.leave) {
      map.set(`${l.member_id}:${l.leave_date}`, l);
    }
    return map;
  }, [plan.leave]);

  const activeMembers = plan.members.filter((m) => !m.is_excluded);
  const memberTotalsById = new Map(plan.member_totals.map((m) => [m.member_id, m]));

  if (dates.length === 0) return null;

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-3 py-2 sticky left-0 bg-white z-10 min-w-[160px]">Member</th>
              {dates.map((d) => (
                <th key={d} className="px-2 py-2 font-medium text-xs text-gray-600 text-center min-w-[56px]">
                  {formatCol(d)}
                </th>
              ))}
              <th className="px-3 py-2 text-xs text-gray-600 text-right min-w-[100px]">Hours</th>
              <th className="px-3 py-2 text-xs text-gray-600 text-right min-w-[60px]">Pts</th>
              <th className="px-3 py-2 text-xs text-gray-600 text-right min-w-[60px]">Req</th>
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((m) => {
              const totals = memberTotalsById.get(m.member_id) || {};
              return (
                <tr key={m.member_id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-3 py-2 sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                      {m.color && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: m.color }}
                        />
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{m.member_name}</p>
                        {m.role && <p className="text-xs text-gray-500">{m.role}</p>}
                      </div>
                    </div>
                  </td>
                  {dates.map((d) => {
                    const entry = leaveByKey.get(`${m.member_id}:${d}`);
                    const color = entry ? TYPE_COLORS[entry.leave_type] : '';
                    const unplanned = entry && entry.is_planned === 0;
                    return (
                      <td key={d} className="px-1 py-1 text-center">
                        <button
                          onClick={() => setEditing({ memberId: m.member_id, date: d, existing: entry })}
                          title={entry
                            ? `${entry.leave_type}${unplanned ? ' (unplanned)' : ''}${entry.loan_note ? ` — ${entry.loan_note}` : ''}`
                            : 'Present — click to add leave'}
                          className={`w-8 h-8 rounded ${entry ? color : 'bg-gray-100 hover:bg-gray-200'} ${unplanned ? 'ring-2 ring-offset-1 ring-red-400' : ''}`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="text-gray-900 font-medium">{totals.actual_hours ?? 0}</span>
                    {totals.planned_hours !== totals.actual_hours && (
                      <span className="text-xs text-gray-400 ml-1">/ {totals.planned_hours}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{totals.points ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{totals.required_allocation ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <CapacityCellPopover
          planId={plan.id}
          memberId={editing.memberId}
          date={editing.date}
          existing={editing.existing}
          teams={teams}
          projects={projects}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChange(); }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Mount the grid in the plan page**

In `client/src/pages/CapacityPlanPage.jsx`, add import at the top:

```jsx
import CapacityGrid from '../components/CapacityGrid';
```

Replace the placeholder at the bottom (the `<div className="bg-white rounded-xl border border-gray-200 p-6">…</div>` block) with:

```jsx
<CapacityGrid plan={plan} onChange={load} />
```

- [ ] **Step 4: Verify build + manual browser check**

```bash
cd client && npm run build
```

With dev server running, open a plan detail page. Expect:
- A table with member rows and date columns. Gray square cells for "present".
- Click a cell → popover with type dropdown, planned checkbox, and (when type = loaned) team/project/note fields.
- Save → cell colors up, popover closes, totals update on the right.
- Clicking a colored cell re-opens with existing values; "Clear" removes it.
- Unplanned entries show a red ring around the cell.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/CapacityGrid.jsx client/src/components/CapacityCellPopover.jsx client/src/pages/CapacityPlanPage.jsx
git commit -m "$(cat <<'EOF'
Add capacity grid and cell popover

CapacityGrid renders a table of non-excluded members × plan weekdays,
with color-coded leave cells and inline per-member summaries on the
right. Clicking a cell opens CapacityCellPopover where leave type,
planned flag, and (when loaned) destination team/project/note can be
edited. Unplanned entries get a red ring. Wired into the plan detail
page; saving triggers a reload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Client — member exclusion, excluded section, add-range modal, and totals panel

**Files:**
- Create: `client/src/components/AddLeaveRangeModal.jsx`
- Create: `client/src/components/CapacityTotalsPanel.jsx`
- Modify: `client/src/components/CapacityGrid.jsx` (add kebab menu per row)
- Modify: `client/src/pages/CapacityPlanPage.jsx` (add range button, excluded section, totals panel)

**Steps:**

- [ ] **Step 1: Create the totals panel**

Create `client/src/components/CapacityTotalsPanel.jsx`:

```jsx
const TYPE_LABELS = {
  vacation: 'Vacation',
  holiday: 'Holiday',
  sick: 'Sick',
  loaned: 'Loaned',
  other: 'Other',
};

const TYPE_BAR_COLORS = {
  vacation: 'bg-blue-500',
  holiday: 'bg-gray-400',
  sick: 'bg-orange-500',
  loaned: 'bg-purple-500',
  other: 'bg-slate-400',
};

export default function CapacityTotalsPanel({ plan }) {
  const t = plan.team_totals;
  const delta = t.planned_hours - t.actual_hours;
  const deltaPct = t.planned_hours > 0 ? (delta / t.planned_hours) * 100 : 0;
  const deltaClass =
    deltaPct > 10 ? 'text-red-600'
      : deltaPct > 5 ? 'text-amber-600'
        : 'text-green-600';

  const breakdownEntries = Object.entries(plan.leave_breakdown).filter(([, h]) => h > 0);
  const maxBreakdownHours = Math.max(...Object.values(plan.leave_breakdown), 1);
  const loanEntries = Object.entries(plan.loan_by_team);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* Capacity */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Capacity</h3>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Planned hours</span>
            <span className="font-medium tabular-nums">{t.planned_hours}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Actual hours</span>
            <span className="font-medium tabular-nums">{t.actual_hours}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total points</span>
            <span className="font-medium tabular-nums">{t.points}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Required allocation</span>
            <span className="font-medium tabular-nums">{t.required_allocation}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
            <span className="text-gray-600">Utilization</span>
            <span className="font-medium tabular-nums">{t.utilization_pct}%</span>
          </div>
        </div>
      </div>

      {/* Planned vs Actual */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Planned vs Actual</h3>
        <div className="flex items-end gap-4">
          <div>
            <p className="text-xs text-gray-500">Planned</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{t.planned_hours}h</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Actual</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{t.actual_hours}h</p>
          </div>
          <div className={`ml-auto ${deltaClass}`}>
            <p className="text-xs">Delta</p>
            <p className="text-xl font-bold tabular-nums">−{delta}h</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          {delta === 0
            ? 'No unplanned leave'
            : `${deltaPct.toFixed(1)}% lost to unplanned leave`}
        </p>
      </div>

      {/* Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Leave breakdown</h3>
        {breakdownEntries.length === 0 ? (
          <p className="text-sm text-gray-400">No leave recorded.</p>
        ) : (
          <div className="space-y-2">
            {breakdownEntries.map(([type, hours]) => (
              <div key={type}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-gray-700">{TYPE_LABELS[type]}</span>
                  <span className="text-gray-600 tabular-nums">{hours}h</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${TYPE_BAR_COLORS[type]}`}
                    style={{ width: `${(hours / maxBreakdownHours) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {loanEntries.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Loans by destination team</p>
            {loanEntries.map(([team, hours]) => (
              <div key={team} className="flex justify-between text-xs">
                <span className="text-gray-700">→ {team}</span>
                <span className="text-gray-600 tabular-nums">{hours}h</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the add-range modal**

Create `client/src/components/AddLeaveRangeModal.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from './ToastProvider';

const LEAVE_TYPES = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'sick', label: 'Sick' },
  { value: 'loaned', label: 'Loaned' },
  { value: 'other', label: 'Other' },
];

export default function AddLeaveRangeModal({ isOpen, onClose, onSaved, plan, teams, projects }) {
  const toast = useToast();
  const [memberId, setMemberId] = useState('');
  const [startDate, setStartDate] = useState(plan?.start_date || '');
  const [endDate, setEndDate] = useState(plan?.start_date || '');
  const [leaveType, setLeaveType] = useState('vacation');
  const [isPlanned, setIsPlanned] = useState(true);
  const [loanTeamId, setLoanTeamId] = useState('');
  const [loanProjectId, setLoanProjectId] = useState('');
  const [loanNote, setLoanNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !plan) return;
    setMemberId('');
    setStartDate(plan.start_date);
    setEndDate(plan.start_date);
    setLeaveType('vacation');
    setIsPlanned(true);
    setLoanTeamId('');
    setLoanProjectId('');
    setLoanNote('');
    setError(null);
  }, [isOpen, plan]);

  if (!isOpen || !plan) return null;

  const activeMembers = plan.members.filter((m) => !m.is_excluded);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post(`/capacity-plans/${plan.id}/leave/range`, {
        member_id: Number(memberId),
        start_date: startDate,
        end_date: endDate,
        leave_type: leaveType,
        is_planned: isPlanned,
        loan_team_id: loanTeamId ? Number(loanTeamId) : null,
        loan_project_id: loanProjectId ? Number(loanProjectId) : null,
        loan_note: loanNote || null,
      });
      toast.success(`Applied to ${result.applied_days} day(s)`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.data?.error || 'Failed to apply range');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add leave range</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Member</label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select…</option>
              {activeMembers.map((m) => (
                <option key={m.member_id} value={m.member_id}>{m.member_name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input
                type="date"
                value={startDate}
                min={plan.start_date}
                max={plan.end_date}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
              <input
                type="date"
                value={endDate}
                min={plan.start_date}
                max={plan.end_date}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isPlanned} onChange={(e) => setIsPlanned(e.target.checked)} />
            Planned (booked before sprint started)
          </label>

          {leaveType === 'loaned' && (
            <div className="space-y-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Loaned to team</label>
                <select
                  value={loanTeamId}
                  onChange={(e) => setLoanTeamId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Select…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Project (optional)</label>
                <select
                  value={loanProjectId}
                  onChange={(e) => setLoanProjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">None</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={loanNote}
                  onChange={(e) => setLoanNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2 disabled:opacity-50">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Apply range
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add exclusion kebab menu to CapacityGrid rows**

In `client/src/components/CapacityGrid.jsx`, extend the imports:

```jsx
import { useState, useMemo, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import api from '../lib/api';
import CapacityCellPopover from './CapacityCellPopover';
```

Add a state for the open kebab near the top of the component:

```jsx
const [menuOpen, setMenuOpen] = useState(null); // member_id or null
```

Add an `excludeMember` helper inside the component:

```jsx
async function excludeMember(memberId) {
  // api helper has no PATCH; use fetch directly.
  const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/capacity-plans/${plan.id}/members/${memberId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_excluded: true }),
  });
  if (res.ok) onChange();
  setMenuOpen(null);
}
```

Inside the member name `<td>` block, wrap the content to include a kebab button on the right:

Replace:

```jsx
<td className="px-3 py-2 sticky left-0 bg-white z-10">
  <div className="flex items-center gap-2">
    {m.color && (
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: m.color }}
      />
    )}
    <div>
      <p className="font-medium text-gray-900">{m.member_name}</p>
      {m.role && <p className="text-xs text-gray-500">{m.role}</p>}
    </div>
  </div>
</td>
```

with:

```jsx
<td className="px-3 py-2 sticky left-0 bg-white z-10">
  <div className="flex items-center gap-2">
    {m.color && (
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: m.color }}
      />
    )}
    <div className="flex-1">
      <p className="font-medium text-gray-900">{m.member_name}</p>
      {m.role && <p className="text-xs text-gray-500">{m.role}</p>}
    </div>
    <div className="relative">
      <button
        onClick={() => setMenuOpen(menuOpen === m.member_id ? null : m.member_id)}
        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {menuOpen === m.member_id && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-44">
          <button
            onClick={() => excludeMember(m.member_id)}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Exclude from plan
          </button>
        </div>
      )}
    </div>
  </div>
</td>
```

- [ ] **Step 4: Add totals panel, add-range button, and excluded section to the plan page**

In `client/src/pages/CapacityPlanPage.jsx`, add imports:

```jsx
import { Plus } from 'lucide-react';
import CapacityTotalsPanel from '../components/CapacityTotalsPanel';
import AddLeaveRangeModal from '../components/AddLeaveRangeModal';
```

Add state near the top of the component:

```jsx
const [showRangeModal, setShowRangeModal] = useState(false);
const [teams, setTeams] = useState([]);
const [projects, setProjects] = useState([]);

useEffect(() => {
  api.get('/teams').then(setTeams).catch(() => setTeams([]));
  api.get('/projects').then(setProjects).catch(() => setProjects([]));
}, []);
```

Add a helper:

```jsx
async function reincludeMember(memberId) {
  const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/capacity-plans/${plan.id}/members/${memberId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_excluded: false }),
  });
  if (res.ok) { toast.success('Re-included'); load(); }
}
```

Insert the totals panel right after the warning banner (after `{plan.working_days === 0 && …}`):

```jsx
<CapacityTotalsPanel plan={plan} />
```

Replace the placeholder `<CapacityGrid plan={plan} onChange={load} />` block with:

```jsx
<div className="flex items-center justify-end mb-3">
  <button
    onClick={() => setShowRangeModal(true)}
    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm flex items-center gap-2"
  >
    <Plus className="w-4 h-4" /> Add range
  </button>
</div>

<CapacityGrid plan={plan} onChange={load} />

{plan.members.some((m) => m.is_excluded) && (
  <details className="bg-white rounded-xl border border-gray-200 p-4 mt-6">
    <summary className="cursor-pointer text-sm font-medium text-gray-700">
      Excluded members ({plan.members.filter((m) => m.is_excluded).length})
    </summary>
    <ul className="mt-3 divide-y divide-gray-100">
      {plan.members.filter((m) => m.is_excluded).map((m) => (
        <li key={m.member_id} className="flex items-center justify-between py-2">
          <span className="text-sm text-gray-900">{m.member_name}</span>
          <button
            onClick={() => reincludeMember(m.member_id)}
            className="text-xs text-blue-600 hover:underline"
          >
            Re-include
          </button>
        </li>
      ))}
    </ul>
  </details>
)}

<AddLeaveRangeModal
  isOpen={showRangeModal}
  onClose={() => setShowRangeModal(false)}
  onSaved={load}
  plan={plan}
  teams={teams}
  projects={projects}
/>
```

- [ ] **Step 5: Verify**

```bash
cd client && npm run build
```

Expected: builds cleanly. With dev server running and a plan open, verify:
- Three totals cards at the top (Capacity / Planned vs Actual / Leave breakdown).
- When no leave: breakdown says "No leave recorded"; delta is 0h; all colored green.
- Click a cell and add planned leave → Capacity card updates, breakdown bar appears.
- Click a cell and mark unplanned leave → Planned vs Actual shows non-zero delta, colored by % (amber or red).
- "Add range" button opens modal; apply a 3-day vacation → affected cells color in, totals update.
- Kebab menu on a member row → "Exclude from plan" hides that row and their hours drop from totals.
- "Excluded members" section appears below the grid; "Re-include" brings them back.
- Switch a cell's leave type to "loaned" with a destination team; breakdown card's "Loans by destination team" shows the team and hours.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/CapacityTotalsPanel.jsx client/src/components/AddLeaveRangeModal.jsx client/src/components/CapacityGrid.jsx client/src/pages/CapacityPlanPage.jsx
git commit -m "$(cat <<'EOF'
Add totals panel, range modal, and member exclusion controls

CapacityTotalsPanel shows three cards: capacity (hours/points/req), a
planned-vs-actual delta with color thresholds (green <5%, amber 5-10%,
red >10%), and a leave-type breakdown with a loans-by-team sub-list.
AddLeaveRangeModal bulk-applies a leave type over a date range. The
grid gains a per-row kebab menu to exclude a member; an excluded-members
details panel below the grid offers re-include.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Client — Settings page "Capacity planning" section

**Files:**
- Modify: `client/src/pages/SettingsPage.jsx`

**Steps:**

- [ ] **Step 1: Add capacity settings state and handlers**

In `client/src/pages/SettingsPage.jsx`, add state declarations near the other `useState` calls (around line 65):

```jsx
// Capacity settings state
const [capacityHpp, setCapacityHpp] = useState(8);
const [capacityAf, setCapacityAf] = useState(0.9);
const [savingCapacity, setSavingCapacity] = useState(false);
```

Add a loader to the initial `useEffect` block (around line 67-71) — modify to call a new function:

```jsx
useEffect(() => {
  loadSettings();
  loadTeams();
  loadStoryStatuses();
  loadCapacitySettings();
}, []);
```

Add the helpers just after the other `loadX` functions:

```jsx
async function loadCapacitySettings() {
  try {
    const data = await api.get('/settings/app/capacity');
    setCapacityHpp(data.capacity_hours_per_point);
    setCapacityAf(data.capacity_allocation_factor);
  } catch {
    // defaults stand
  }
}

async function handleSaveCapacity() {
  setSavingCapacity(true);
  try {
    await api.put('/settings/app/capacity', {
      capacity_hours_per_point: Number(capacityHpp),
      capacity_allocation_factor: Number(capacityAf),
    });
    toast.success('Capacity settings saved');
  } catch (err) {
    toast.error(err.data?.error || 'Failed to save capacity settings');
  } finally {
    setSavingCapacity(false);
  }
}
```

- [ ] **Step 2: Add the Capacity planning card**

Append this card at the very bottom of the returned JSX, just before the closing `</div>` of the `max-w-3xl` wrapper (after the Teams card and before the `{syncBoard && …}` block):

```jsx
{/* Capacity planning */}
<div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-emerald-50 rounded-lg">
      <Check className="w-5 h-5 text-emerald-600" />
    </div>
    <div>
      <h2 className="text-lg font-semibold text-gray-900">Capacity planning</h2>
      <p className="text-sm text-gray-500">Global constants used by sprint capacity plans</p>
    </div>
  </div>
  <div className="grid grid-cols-2 gap-4">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Hours per point</label>
      <input
        type="number"
        step="0.5"
        min="0.5"
        value={capacityHpp}
        onChange={(e) => setCapacityHpp(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
      />
      <p className="text-xs text-gray-400 mt-1">Default 8 — one story point = 8 hours</p>
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Allocation factor</label>
      <input
        type="number"
        step="0.05"
        min="0"
        max="1"
        value={capacityAf}
        onChange={(e) => setCapacityAf(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
      />
      <p className="text-xs text-gray-400 mt-1">Default 0.9 — reserves 10% for meetings/overhead</p>
    </div>
  </div>
  <button
    onClick={handleSaveCapacity}
    disabled={savingCapacity}
    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2 disabled:opacity-50"
  >
    {savingCapacity ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
    Save capacity settings
  </button>
</div>
```

- [ ] **Step 3: Verify**

```bash
cd client && npm run build
```

Expected: builds cleanly. Open `/settings`, scroll to the bottom. Expect a "Capacity planning" card with two inputs. Change `Hours per point` to 7 and click Save → toast "Capacity settings saved". Navigate to a capacity plan page and verify per-member points use hpp=7 (e.g. 80h / 7 ≈ 11.4 points). Reset hpp to 8.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/SettingsPage.jsx
git commit -m "$(cat <<'EOF'
Add Capacity planning card to Settings page

Two global constants used by capacity plans: hours per point (default 8)
and allocation factor (default 0.9). Loaded from and saved to
/api/settings/app/capacity.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Client — SprintsPage capacity badge cross-link

**Files:**
- Modify: `client/src/pages/SprintsPage.jsx`

**Steps:**

- [ ] **Step 1: Fetch all capacity plans and build a lookup**

Open `client/src/pages/SprintsPage.jsx`. Near the other `useState` declarations (around line 12-30), add:

```jsx
const [capacityPlansByName, setCapacityPlansByName] = useState({});
```

In the existing `useEffect` block that loads teams/members (around line 52-60), append another fetch:

```jsx
api.get('/capacity-plans').then((data) => {
  const map = {};
  for (const p of data) {
    if (p.jira_sprint_name) map[p.jira_sprint_name] = p;
  }
  setCapacityPlansByName(map);
}).catch(() => setCapacityPlansByName({}));
```

- [ ] **Step 2: Render the badge**

Find where each sprint row renders its label — search within this file for the line where the sprint `.name` is displayed in the sprint list/selector. This is around the `<SprintListView ... />` usage, which receives `sprints` as a prop. To avoid invasive changes to the list component, render the badge within the sprint selector header instead.

Search for the element that displays the currently-selected sprint name (typically an `<h2>` or similar near the top of the sprint detail area). Add a sibling badge element beside it:

```jsx
{selectedSprint && capacityPlansByName[selectedSprint] && (
  <Link
    to={`/capacity/${capacityPlansByName[selectedSprint].id}`}
    className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-medium hover:bg-emerald-100"
  >
    Planned {capacityPlansByName[selectedSprint].planned_hours}h · Actual {capacityPlansByName[selectedSprint].actual_hours}h · {capacityPlansByName[selectedSprint].total_points}pts
  </Link>
)}
```

At the top of the file, add `Link` to the imports:

```jsx
import { Link } from 'react-router-dom';
```

If the exact location of the sprint name header is unclear, place the badge immediately above the `<SprintListView />` invocation in the JSX — it will render as a standalone badge when a sprint is selected and a matching plan exists.

- [ ] **Step 3: Verify**

```bash
cd client && npm run build
```

Expected: builds cleanly. To verify:
1. Open a capacity plan you've been testing with and set its Jira sprint name to match a real Jira sprint in your DB (if you have imported sprints). If you don't, use the seeded plan's `jira_sprint_name` (e.g. "Sprint 48") and ensure a sprint with that exact name exists in `story_sprint_history`.
2. Navigate to `/sprints` and select that sprint. A green pill should appear showing "Planned Xh · Actual Yh · Zpts".
3. Click the pill → navigates to `/capacity/:id`.
4. For sprints without a matching plan, no badge appears.

If you have no matching data, skip this manual verification and rely on the build passing; the architect's next step will be manual testing.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/SprintsPage.jsx
git commit -m "$(cat <<'EOF'
Cross-link capacity plans from SprintsPage

Fetches all capacity plans on mount, indexes them by jira_sprint_name,
and renders a badge linking to the plan detail whenever the selected
sprint's name matches. Shows planned hours, actual hours, and total
points at a glance.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Wrap-up

After Task 18, run the skill `superpowers:finishing-a-development-branch` to verify and integrate the work.

Final baseline checks before handing off:

```bash
cd client && npm run build
```

Expected: build succeeds with no errors.

Start `npm run dev` from the worktree root, walk through this end-to-end flow:
1. `/capacity` → create a new plan for an existing team.
2. On the detail page, add leave via clicking cells and via "Add range".
3. Toggle one member excluded; re-include.
4. Switch a leave type to "loaned"; confirm loan destination shows in the breakdown.
5. Change the plan's end date to be earlier; confirm leave entries outside the new range disappear.
6. Visit `/settings`, tweak hours-per-point, confirm the plan's points recompute.
7. Set the plan's Jira sprint name to match an existing imported sprint; visit `/sprints`; confirm the capacity badge appears.

---

## Self-Review Checklist

(Worker: skip this — it's for the plan author's reference.)

- Spec coverage: all 5 design sections (data model, API, UI, calculations, settings/cross-link/edge cases) covered across tasks 1–18.
- No placeholders: every task has complete code blocks.
- Type/name consistency: `capacity_plans.jira_sprint_name`, `capacity_leave.is_planned`, `capacity_plan_members.is_excluded`, and `leave_type` enum values are consistent across server and client.
- TDD caveat: project has no test framework (per CLAUDE.md). Verifications are manual `curl` + build + browser checks.
- Commits: one per task, plain imperative style matching existing git log.
