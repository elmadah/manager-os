# Projects Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Gantt-style Roadmap sub-tab to the Projects page that visualizes all projects and their features over a 12-month, quarter-grouped window, with status/health filters, an Unscheduled section, and click-through to project detail.

**Architecture:** One new lightweight server endpoint (`GET /api/projects/roadmap`) returns projects-in-range with nested features and per-feature story stats. The client renders a CSS-grid Gantt (no external chart lib) with absolute-positioned bars whose left/width are computed from date math in a pure helpers module. `/projects` becomes a tabbed shell (`ProjectsLayout`) with nested routes `/projects/board` (existing kanban) and `/projects/roadmap` (new). Filter state lives in URL search params so views are shareable.

**Tech Stack:** Express + sql.js (server), React 18 + React Router v7 + Tailwind v4 + lucide-react (client). No new dependencies.

**Repo conventions:**
- No test framework is configured. Tasks gate on **manual verification** (curl + browser checks) — explicit expected output is given for each.
- No linter. Match surrounding code style (2-space indent, single quotes, semicolons, CommonJS server, ESM client).
- Database is sql.js with a better-sqlite3-compatible wrapper. Writes auto-persist. Read with `db.prepare(sql).all/get(...args)`.
- Dates in the DB are stored as `YYYY-MM-DD` text. Parse with `new Date(y, m-1, d)` (local midnight) — **never** `new Date('2026-05-11')` (UTC).

**Design reference:** `docs/plans/2026-05-11-projects-roadmap-design.html` (open in browser for mockups + data flow).

**Frequent commits:** commit after each task. Use the conventional message prefix from recent log (`feat:`, `chore:`, etc.).

---

## File Map

**Create:**
- `client/src/lib/roadmap.js` — date math + health derivation (pure)
- `client/src/components/RoadmapToolbar.jsx` — range/filter/zoom controls
- `client/src/components/RoadmapBar.jsx` — one bar + tooltip
- `client/src/components/RoadmapGantt.jsx` — header rows + body rows + today line
- `client/src/components/UnscheduledList.jsx` — items missing dates
- `client/src/components/ProjectsLayout.jsx` — shared header + tab bar + `<Outlet/>`
- `client/src/pages/ProjectsRoadmapPage.jsx` — fetch + URL state + compose

**Modify:**
- `server/routes/projects.js` — add `GET /roadmap` **above** `GET /:id`
- `client/src/App.jsx` — replace flat `/projects` route with nested layout
- `client/src/pages/ProjectsPage.jsx` — strip outer page chrome (header + Add button move into `ProjectsLayout`); rename file to `ProjectsBoardPage.jsx` for clarity

---

## Task 1: Backend — `GET /api/projects/roadmap`

**Files:**
- Modify: `server/routes/projects.js` — insert handler between line 6 (after `router.get('/')` finishes at line 95) and line 97 (`router.get('/:id')`)

### Step 1.1: Add the handler

- [ ] Open `server/routes/projects.js`. Locate line 97 where `router.get('/:id', ...)` begins. Insert the new handler **immediately above** that line (Express matches routes in declaration order; `roadmap` would otherwise be captured by `/:id`).

```javascript
// GET /api/projects/roadmap?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns projects overlapping the window (or unscheduled) with nested features and per-feature story stats.
router.get('/roadmap', (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
    }

    // Projects in window OR unscheduled (missing either date)
    const projectRows = db.prepare(`
      SELECT p.*,
        COALESCE(s.total_stories, 0) AS total_stories,
        COALESCE(s.completed_stories, 0) AS completed_stories,
        COALESCE(s.total_points, 0) AS total_points,
        COALESCE(s.completed_points, 0) AS completed_points
      FROM projects p
      LEFT JOIN (
        SELECT f.project_id,
          COUNT(st.id) AS total_stories,
          SUM(CASE WHEN ${doneCondition('st.status')} THEN 1 ELSE 0 END) AS completed_stories,
          SUM(st.story_points) AS total_points,
          SUM(CASE WHEN ${doneCondition('st.status')} THEN st.story_points ELSE 0 END) AS completed_points
        FROM features f
        JOIN stories st ON st.feature_id = f.id
        GROUP BY f.project_id
      ) s ON s.project_id = p.id
      WHERE p.start_date IS NULL
         OR p.target_date IS NULL
         OR (p.target_date >= ? AND p.start_date <= ?)
      ORDER BY COALESCE(p.start_date, '9999-12-31'), p.name
    `).all(start, end);

    const projectIds = projectRows.map(p => p.id);

    // Features for those projects with per-feature story aggregate
    let featureRows = [];
    if (projectIds.length > 0) {
      const placeholders = projectIds.map(() => '?').join(',');
      featureRows = db.prepare(`
        SELECT f.*,
          COALESCE(s.total, 0) AS total_stories,
          COALESCE(s.completed, 0) AS completed_stories,
          COALESCE(s.total_points, 0) AS total_points,
          COALESCE(s.completed_points, 0) AS completed_points
        FROM features f
        LEFT JOIN (
          SELECT feature_id,
            COUNT(*) AS total,
            SUM(CASE WHEN ${doneCondition('status')} THEN 1 ELSE 0 END) AS completed,
            SUM(story_points) AS total_points,
            SUM(CASE WHEN ${doneCondition('status')} THEN story_points ELSE 0 END) AS completed_points
          FROM stories
          GROUP BY feature_id
        ) s ON s.feature_id = f.id
        WHERE f.project_id IN (${placeholders})
        ORDER BY COALESCE(f.start_date, '9999-12-31'), f.name
      `).all(...projectIds);
    }

    // Partition features into scheduled (in window) vs unscheduled
    const inWindow = (d1, d2) => d1 && d2 && d2 >= start && d1 <= end;
    const scheduledByProject = {};
    const unscheduledFeatures = [];
    for (const f of featureRows) {
      const feature = {
        id: f.id,
        project_id: f.project_id,
        name: f.name,
        status: f.status,
        priority: f.priority,
        start_date: f.start_date,
        target_date: f.target_date,
        story_stats: {
          total: f.total_stories,
          completed: f.completed_stories,
          total_points: f.total_points,
          completed_points: f.completed_points,
        },
      };
      if (!f.start_date || !f.target_date) {
        unscheduledFeatures.push(feature);
      } else if (inWindow(f.start_date, f.target_date)) {
        (scheduledByProject[f.project_id] = scheduledByProject[f.project_id] || []).push(feature);
      } else {
        // In a real project but outside the window — drop it from the response;
        // the client surfaces "N hidden" via project feature_count vs returned feature count.
      }
    }

    // Partition projects into scheduled vs unscheduled
    const scheduledProjects = [];
    const unscheduledProjects = [];
    for (const p of projectRows) {
      const features = scheduledByProject[p.id] || [];
      const base = {
        id: p.id,
        name: p.name,
        status: p.status,
        health: p.health,
        color: p.color,
        start_date: p.start_date,
        target_date: p.target_date,
        story_stats: {
          total: p.total_stories,
          completed: p.completed_stories,
          total_points: p.total_points,
          completed_points: p.completed_points,
        },
        features,
      };
      if (!p.start_date || !p.target_date) {
        unscheduledProjects.push(base);
      } else {
        scheduledProjects.push(base);
      }
    }

    res.json({
      range: { start, end },
      projects: scheduledProjects,
      unscheduled: {
        projects: unscheduledProjects.map(p => ({ id: p.id, name: p.name, health: p.health })),
        features: unscheduledFeatures.map(f => ({ id: f.id, project_id: f.project_id, name: f.name })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

### Step 1.2: Verify the endpoint with curl

- [ ] In one terminal, start the dev servers from the repo root:

```bash
npm run dev
```

Wait for "Server running on port 3001" and the Vite line.

- [ ] In another terminal, hit the endpoint:

```bash
curl -s 'http://localhost:3001/api/projects/roadmap?start=2026-04-01&end=2027-03-31' | head -c 800
```

**Expected:** JSON beginning with `{"range":{"start":"2026-04-01","end":"2027-03-31"},"projects":[...]` and containing at least one project entry with a `features` array and a `story_stats` object. If the DB is empty, expect `"projects":[]` and an `"unscheduled"` block.

- [ ] Error-path check:

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3001/api/projects/roadmap'
```

**Expected:** `400`

- [ ] Route-order regression check — make sure `GET /api/projects/123` still works:

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3001/api/projects/1'
```

**Expected:** `200` (or `404` if project 1 doesn't exist, but **not** the 400 from the roadmap handler — that would mean `/:id` matched `/roadmap`).

### Step 1.3: Commit

- [ ] ```bash
git add server/routes/projects.js
git commit -m "feat: add GET /api/projects/roadmap endpoint"
```

---

## Task 2: Roadmap math helpers (`lib/roadmap.js`)

**Files:**
- Create: `client/src/lib/roadmap.js`

These are the pure functions all components depend on. Writing them first means downstream UI tasks have a stable contract.

### Step 2.1: Create the file

- [ ] ```javascript
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
  const d = new Date(date.getFullYear(), date.getMonth() + n, date.getDate());
  return d;
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
 * Build a list of month ticks for the header. Each entry: { label, year, leftPct, widthPct }.
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
  const now = new Date();
  if (now < r0 || now > r1) return null;
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
```

### Step 2.2: Sanity-check in the browser console

- [ ] With `npm run dev` running, open `http://localhost:5173`, open DevTools console, and run:

```javascript
const m = await import('/src/lib/roadmap.js');
console.log(m.defaultRange(new Date('2026-05-11T12:00:00')));
// Expected: { start: '2026-04-01', end: '2027-03-31' }

console.log(m.computeBarPosition({ start: '2026-05-08', target: '2026-08-30', rangeStart: '2026-04-01', rangeEnd: '2027-03-31' }));
// Expected: leftPct ≈ 10.2, widthPct ≈ 30.9

console.log(m.quarterTicks('2026-04-01', '2027-03-31').map(t => t.label));
// Expected: ["Q2 '26 · Apr – Jun", "Q3 '26 · Jul – Sep", "Q4 '26 · Oct – Dec", "Q1 '27 · Jan – Mar"]

console.log(m.healthOfFeature({ status: 'in_progress', start_date: '2026-04-01', target_date: '2026-06-01', story_stats: { total: 10, completed: 1 } }));
// Expected: 'yellow' (today May 11, elapsed ≈ 66%, actual = 10%)
```

### Step 2.3: Commit

- [ ] ```bash
git add client/src/lib/roadmap.js
git commit -m "feat: add roadmap date math and health helpers"
```

---

## Task 3: Routing + `ProjectsLayout` shell

Move the page header + Add button + tab bar into a layout component shared by board and roadmap routes.

**Files:**
- Create: `client/src/components/ProjectsLayout.jsx`
- Rename: `client/src/pages/ProjectsPage.jsx` → `client/src/pages/ProjectsBoardPage.jsx`
- Modify: the renamed file (strip the outer header — it lives in the layout now)
- Modify: `client/src/App.jsx`

### Step 3.1: Create the layout

- [ ] ```jsx
// client/src/components/ProjectsLayout.jsx
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Plus } from 'lucide-react';
import CreateProjectModal from './CreateProjectModal';

export default function ProjectsLayout() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Project
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[
          { to: '/projects/board', label: 'Board' },
          { to: '/projects/roadmap', label: 'Roadmap' },
        ].map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-blue-600 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <Outlet context={{ refreshKey, requestRefresh: () => setRefreshKey(k => k + 1) }} />
      </div>

      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => setRefreshKey(k => k + 1)}
      />
    </div>
  );
}
```

### Step 3.2: Rename and strip the board page

- [ ] ```bash
git mv client/src/pages/ProjectsPage.jsx client/src/pages/ProjectsBoardPage.jsx
```

- [ ] In `client/src/pages/ProjectsBoardPage.jsx`:
  - Rename the default export from `ProjectsPage` to `ProjectsBoardPage`.
  - **Remove** the outer wrapper `<div className="h-full flex flex-col">`, the `<h1>Projects</h1>` header, the `Add Project` button, and the `<CreateProjectModal>` block — they're in the layout now.
  - Replace the unused `Plus` import; keep `Calendar` (used by cards).
  - Use `useOutletContext` to receive the refresh signal so a new project from the layout's modal triggers `loadProjects`.

Apply this diff conceptually (the exact patched component):

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Calendar } from 'lucide-react';
import api from '../lib/api';

const COLUMNS = [ /* unchanged */ ];
const HEALTH_COLORS = { /* unchanged */ };
const HEALTH_DOT_COLORS = { /* unchanged */ };

export default function ProjectsBoardPage() {
  const navigate = useNavigate();
  const { refreshKey } = useOutletContext() ?? {};
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    try {
      const data = await api.get('/projects');
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects, refreshKey]);

  // ... unchanged getColumnProjects, handleDragEnd, loading branch ...

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 h-full min-h-0">
        {/* unchanged kanban columns */}
      </div>
    </DragDropContext>
  );
}
```

Keep the existing kanban column JSX **byte-for-byte**; only the outer wrapper, header, button, and modal are removed, and the import/export rename.

### Step 3.3: Wire up the routes

- [ ] Edit `client/src/App.jsx`:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProjectsLayout from './components/ProjectsLayout';
import HomePage from './pages/HomePage';
import ProjectsBoardPage from './pages/ProjectsBoardPage';
import ProjectsRoadmapPage from './pages/ProjectsRoadmapPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
// ...other imports unchanged

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<ProjectsLayout />}>
            <Route index element={<Navigate to="board" replace />} />
            <Route path="board" element={<ProjectsBoardPage />} />
            <Route path="roadmap" element={<ProjectsRoadmapPage />} />
          </Route>
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          {/* ...other routes unchanged */}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

Note: `/projects/:id` stays at the top level (not nested) because the detail page is a standalone view, not a tab.

### Step 3.4: Create a placeholder roadmap page so routes resolve

- [ ] ```jsx
// client/src/pages/ProjectsRoadmapPage.jsx
export default function ProjectsRoadmapPage() {
  return <div className="text-gray-400">Roadmap coming up…</div>;
}
```

This is just so step 3.5 verification works; Task 8 replaces this file in full.

### Step 3.5: Verify routes manually

- [ ] With `npm run dev` running, visit:
  - `http://localhost:5173/projects` — should redirect to `/projects/board` and show the kanban.
  - `http://localhost:5173/projects/roadmap` — should show "Roadmap coming up…".
  - Click between the two tabs — active tab indicator should switch.
  - Click "+ Add Project" on either tab — the modal should open; create a project; the board should reflect it after closing.
  - Click a project card → `/projects/:id` should still load.

### Step 3.6: Commit

- [ ] ```bash
git add client/src/App.jsx client/src/components/ProjectsLayout.jsx client/src/pages/ProjectsBoardPage.jsx client/src/pages/ProjectsRoadmapPage.jsx
git commit -m "refactor: extract ProjectsLayout shell with board/roadmap tabs"
```

---

## Task 4: `RoadmapToolbar.jsx`

Filter and range controls that read/write URL search params.

**Files:**
- Create: `client/src/components/RoadmapToolbar.jsx`

### Step 4.1: Implement

- [ ] ```jsx
// client/src/components/RoadmapToolbar.jsx
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { parseLocalDate, formatLocalDate, addMonths, defaultRange, snapToQuarterStart } from '../lib/roadmap';

const STATUSES = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'wrapping_up', label: 'Wrapping up' },
  { value: 'complete', label: 'Complete' },
];

const HEALTHS = [
  { value: 'green', label: 'On track' },
  { value: 'yellow', label: 'At risk' },
  { value: 'red', label: 'Off track' },
];

function presetRange(preset) {
  const now = new Date();
  switch (preset) {
    case '3m': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
      return { start: formatLocalDate(start), end: formatLocalDate(end) };
    }
    case '6m': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 6, 0);
      return { start: formatLocalDate(start), end: formatLocalDate(end) };
    }
    case '12m':
    default:
      return defaultRange(now);
  }
}

export default function RoadmapToolbar({ params, setParams }) {
  const { start, end, status, health } = params;

  function setRangePreset(preset) {
    const { start, end } = presetRange(preset);
    setParams({ ...params, start, end, preset });
  }

  function shiftWindow(direction) {
    const s = parseLocalDate(start);
    const e = parseLocalDate(end);
    const months = Math.round((e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())) || 1;
    const shift = Math.max(1, Math.round(months / 2)) * (direction === 'next' ? 1 : -1);
    const newStart = snapToQuarterStart(addMonths(s, shift));
    const newEnd = new Date(newStart.getFullYear(), newStart.getMonth() + months + 1, 0);
    setParams({ ...params, start: formatLocalDate(newStart), end: formatLocalDate(newEnd), preset: 'custom' });
  }

  function goToday() {
    setRangePreset('12m');
  }

  function toggleSet(field, value) {
    const set = new Set(params[field] || []);
    set.has(value) ? set.delete(value) : set.add(value);
    setParams({ ...params, [field]: Array.from(set) });
  }

  return (
    <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white"
          value={params.preset || '12m'}
          onChange={e => setRangePreset(e.target.value)}
        >
          <option value="3m">Range: Next 3 months</option>
          <option value="6m">Range: Next 6 months</option>
          <option value="12m">Range: Next 12 months (by quarter)</option>
          <option value="custom" disabled>Custom</option>
        </select>

        <MultiSelect label="Status" options={STATUSES} selected={status} onToggle={v => toggleSet('status', v)} />
        <MultiSelect label="Health" options={HEALTHS} selected={health} onToggle={v => toggleSet('health', v)} />
      </div>

      <div className="flex items-center gap-1">
        <button onClick={goToday} className="text-sm px-3 py-1 border border-gray-200 rounded-md bg-white hover:bg-gray-50">Today</button>
        <button onClick={() => shiftWindow('prev')} aria-label="Previous" className="p-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50">
          <ChevronLeft size={16} />
        </button>
        <button onClick={() => shiftWindow('next')} aria-label="Next" className="p-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function MultiSelect({ label, options, selected, onToggle }) {
  const count = (selected || []).length;
  const summary = count === 0 ? 'All' : count === options.length ? 'All' : `${count} selected`;
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer text-sm border border-gray-200 rounded-md px-2 py-1 bg-white select-none">
        {label}: {summary}
      </summary>
      <div className="absolute z-10 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg p-2">
        {options.map(o => (
          <label key={o.value} className="flex items-center gap-2 text-sm py-1 px-1 hover:bg-gray-50 rounded cursor-pointer">
            <input
              type="checkbox"
              checked={(selected || []).includes(o.value)}
              onChange={() => onToggle(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  );
}
```

### Step 4.2: Commit

- [ ] ```bash
git add client/src/components/RoadmapToolbar.jsx
git commit -m "feat: add RoadmapToolbar with range presets and filters"
```

---

## Task 5: `RoadmapBar.jsx`

A single positioned bar with hover tooltip. Used by both project rows and feature rows.

**Files:**
- Create: `client/src/components/RoadmapBar.jsx`

### Step 5.1: Implement

- [ ] ```jsx
// client/src/components/RoadmapBar.jsx
import { useState } from 'react';

export default function RoadmapBar({ position, color, label, kind, tooltip, onClick }) {
  const [hover, setHover] = useState(false);
  if (!position) return null;

  const heightClass = kind === 'project' ? 'h-3' : 'h-[18px]';
  const topClass = kind === 'project' ? 'top-[11px]' : 'top-2';
  const clipLeft = position.clippedStart ? 'rounded-l-none' : 'rounded-l';
  const clipRight = position.clippedEnd ? 'rounded-r-none' : 'rounded-r';

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`absolute ${topClass} ${heightClass} ${clipLeft} ${clipRight} text-white text-[11px] leading-[18px] px-2 truncate cursor-pointer shadow-sm hover:brightness-110`}
      style={{
        left: `${position.leftPct}%`,
        width: `${position.widthPct}%`,
        backgroundColor: color,
        opacity: kind === 'project' ? 0.75 : 1,
      }}
    >
      {kind === 'feature' && label}
      {hover && tooltip && (
        <div
          className="absolute z-20 bg-slate-900 text-slate-100 text-xs rounded-md px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap"
          style={{ top: 'calc(100% + 6px)', left: 0 }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}
```

### Step 5.2: Commit

- [ ] ```bash
git add client/src/components/RoadmapBar.jsx
git commit -m "feat: add RoadmapBar with hover tooltip"
```

---

## Task 6: `RoadmapGantt.jsx`

The presentational Gantt: quarter band, month headers, project rows with nested feature rows, today line.

**Files:**
- Create: `client/src/components/RoadmapGantt.jsx`

### Step 6.1: Implement

- [ ] ```jsx
// client/src/components/RoadmapGantt.jsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  monthTicks,
  quarterTicks,
  computeBarPosition,
  todayPercent,
  healthOfFeature,
  HEALTH_BAR_COLORS,
} from '../lib/roadmap';
import Bar from './RoadmapBar';

const HEALTH_DOT = { green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500' };

function formatRange(start, target) {
  const fmt = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} → ${fmt(target)}`;
}

function projectTooltip(p) {
  const s = p.story_stats || {};
  return `${p.name}\n${formatRange(p.start_date, p.target_date)}\n${s.completed}/${s.total} stories · ${s.completed_points}/${s.total_points} pts`;
}

function featureTooltip(f) {
  const s = f.story_stats || {};
  return `${f.name}\n${formatRange(f.start_date, f.target_date)}\n${s.completed}/${s.total} stories · ${s.completed_points}/${s.total_points} pts`;
}

export default function RoadmapGantt({ projects, rangeStart, rangeEnd, showQuarterBand }) {
  const navigate = useNavigate();
  const months = useMemo(() => monthTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const quarters = useMemo(() => quarterTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const todayPct = useMemo(() => todayPercent(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  if (projects.length === 0) {
    return <div className="text-sm text-gray-400 py-8 text-center">No projects in this range.</div>;
  }

  return (
    <div className="relative border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Quarter band */}
      {showQuarterBand && (
        <div className="grid border-b border-gray-200 bg-indigo-50" style={{ gridTemplateColumns: '220px 1fr' }}>
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Quarter</div>
          <div className="relative h-6">
            {quarters.map((q, i) => (
              <div
                key={i}
                className="absolute inset-y-0 border-l border-indigo-200 px-2 text-[11px] font-semibold text-indigo-700 flex items-center"
                style={{ left: `${q.leftPct}%`, width: `${q.widthPct}%` }}
              >
                {q.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Month header */}
      <div className="grid border-b border-gray-200 bg-gray-50" style={{ gridTemplateColumns: '220px 1fr' }}>
        <div className="px-3 py-1.5 text-xs text-gray-500">Project / Feature</div>
        <div className="relative h-6">
          {months.map((m, i) => {
            const isQuarterStart = m.month % 3 === 0;
            return (
              <div
                key={i}
                className="absolute inset-y-0 px-1.5 text-[11px] text-gray-500 flex items-center"
                style={{
                  left: `${m.leftPct}%`,
                  width: `${m.widthPct}%`,
                  borderLeft: isQuarterStart ? '1px solid #c7d2fe' : '1px dashed #f1f5f9',
                }}
              >
                {m.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div className="relative">
        {projects.map(p => (
          <ProjectGroup
            key={p.id}
            project={p}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onProjectClick={() => navigate(`/projects/${p.id}`)}
            onFeatureClick={() => navigate(`/projects/${p.id}`)}
          />
        ))}

        {todayPct !== null && (
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 pointer-events-none"
            style={{ left: `calc(220px + ${todayPct}%)` }}
          >
            <div className="absolute -top-5 -translate-x-1/2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded">
              Today
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectGroup({ project, rangeStart, rangeEnd, onProjectClick, onFeatureClick }) {
  const projectPosition = useMemo(
    () => computeBarPosition({ start: project.start_date, target: project.target_date, rangeStart, rangeEnd }),
    [project.start_date, project.target_date, rangeStart, rangeEnd]
  );

  return (
    <>
      <div className="grid bg-slate-50/60 border-b border-gray-100" style={{ gridTemplateColumns: '220px 1fr' }}>
        <div className="px-3 py-2 flex items-center gap-2 border-r border-gray-100">
          <span className={`w-2 h-2 rounded-full ${HEALTH_DOT[project.health] || HEALTH_DOT.green}`} />
          <span className="font-semibold text-sm text-gray-800 truncate">{project.name}</span>
        </div>
        <div className="relative h-9">
          <GridLines rangeStart={rangeStart} rangeEnd={rangeEnd} />
          <Bar
            position={projectPosition}
            color={project.color || '#3b82f6'}
            label={project.name}
            kind="project"
            tooltip={projectTooltip(project)}
            onClick={onProjectClick}
          />
        </div>
      </div>

      {project.features.map(f => {
        const pos = computeBarPosition({ start: f.start_date, target: f.target_date, rangeStart, rangeEnd });
        const health = healthOfFeature(f);
        return (
          <div key={f.id} className="grid border-b border-gray-50" style={{ gridTemplateColumns: '220px 1fr' }}>
            <div className="pl-8 pr-3 py-2 text-sm text-gray-500 border-r border-gray-100 truncate">{f.name}</div>
            <div className="relative h-9">
              <GridLines rangeStart={rangeStart} rangeEnd={rangeEnd} />
              <Bar
                position={pos}
                color={HEALTH_BAR_COLORS[health]}
                label={f.name}
                kind="feature"
                tooltip={featureTooltip(f)}
                onClick={onFeatureClick}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

function GridLines({ rangeStart, rangeEnd }) {
  const months = useMemo(() => monthTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  return (
    <div className="absolute inset-0 pointer-events-none">
      {months.map((m, i) => {
        const isQuarterStart = m.month % 3 === 0;
        return (
          <div
            key={i}
            className="absolute inset-y-0"
            style={{
              left: `${m.leftPct}%`,
              borderLeft: isQuarterStart ? '1px solid #e0e7ff' : '1px dashed #f1f5f9',
            }}
          />
        );
      })}
    </div>
  );
}

```

### Step 6.2: Commit

- [ ] ```bash
git add client/src/components/RoadmapGantt.jsx
git commit -m "feat: add RoadmapGantt with quarter band and today line"
```

---

## Task 7: `UnscheduledList.jsx`

A collapsible card showing projects/features missing dates.

**Files:**
- Create: `client/src/components/UnscheduledList.jsx`

### Step 7.1: Implement

- [ ] ```jsx
// client/src/components/UnscheduledList.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

export default function UnscheduledList({ unscheduled }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const projects = unscheduled?.projects || [];
  const features = unscheduled?.features || [];
  const total = projects.length + features.length;
  if (total === 0) return null;

  return (
    <div className="mt-4 border border-amber-200 bg-amber-50 rounded-lg">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-900"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <AlertCircle size={14} />
        Unscheduled ({total}) — items missing start or target dates
      </button>
      {open && (
        <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {projects.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-amber-700 mb-1">Projects</div>
              <ul>
                {projects.slice(0, 10).map(p => (
                  <li key={p.id}>
                    <button onClick={() => navigate(`/projects/${p.id}`)} className="hover:underline text-amber-900">
                      {p.name}
                    </button>
                  </li>
                ))}
                {projects.length > 10 && <li className="text-amber-700">…and {projects.length - 10} more</li>}
              </ul>
            </div>
          )}
          {features.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-amber-700 mb-1">Features</div>
              <ul>
                {features.slice(0, 10).map(f => (
                  <li key={f.id}>
                    <button onClick={() => navigate(`/projects/${f.project_id}`)} className="hover:underline text-amber-900">
                      {f.name}
                    </button>
                  </li>
                ))}
                {features.length > 10 && <li className="text-amber-700">…and {features.length - 10} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Step 7.2: Commit

- [ ] ```bash
git add client/src/components/UnscheduledList.jsx
git commit -m "feat: add UnscheduledList for items missing dates"
```

---

## Task 8: `ProjectsRoadmapPage.jsx` container

The page that wires URL state → fetch → filter → components.

**Files:**
- Replace: `client/src/pages/ProjectsRoadmapPage.jsx` (overwriting the placeholder from Task 3.4)

### Step 8.1: Implement

- [ ] ```jsx
// client/src/pages/ProjectsRoadmapPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { defaultRange, healthOfFeature } from '../lib/roadmap';
import RoadmapToolbar from '../components/RoadmapToolbar';
import RoadmapGantt from '../components/RoadmapGantt';
import UnscheduledList from '../components/UnscheduledList';

function parseList(v) {
  if (!v) return [];
  return v.split(',').filter(Boolean);
}

function deriveProjectHealthBucket(p) {
  return p.health || 'green';
}

export default function ProjectsRoadmapPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const fallback = defaultRange(new Date());
    return {
      start: searchParams.get('start') || fallback.start,
      end: searchParams.get('end') || fallback.end,
      preset: searchParams.get('preset') || '12m',
      status: parseList(searchParams.get('status')),
      health: parseList(searchParams.get('health')),
    };
  }, [searchParams]);

  function setParams(next) {
    const sp = new URLSearchParams();
    sp.set('start', next.start);
    sp.set('end', next.end);
    if (next.preset && next.preset !== '12m') sp.set('preset', next.preset);
    if (next.status?.length) sp.set('status', next.status.join(','));
    if (next.health?.length) sp.set('health', next.health.join(','));
    setSearchParams(sp, { replace: true });
  }

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/projects/roadmap?start=${params.start}&end=${params.end}`)
      .then(d => { if (!cancelled) { setData(d); setError(null); } })
      .catch(err => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params.start, params.end]);

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    return data.projects.filter(p => {
      if (params.status.length && !params.status.includes(p.status)) return false;
      if (params.health.length && !params.health.includes(deriveProjectHealthBucket(p))) return false;
      return true;
    }).map(p => ({
      ...p,
      features: params.health.length
        ? p.features.filter(f => params.health.includes(healthOfFeature(f)))
        : p.features,
    }));
  }, [data, params.status, params.health]);

  return (
    <div className="h-full flex flex-col">
      <RoadmapToolbar params={params} setParams={setParams} />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-3">
        <Legend swatch="#3b82f6" label="Project span" />
        <Legend swatch="#10b981" label="Feature (on track)" />
        <Legend swatch="#f59e0b" label="Feature (at risk)" />
        <Legend swatch="#ef4444" label="Feature (off track)" />
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-[2px] h-3 bg-red-500" /> Today</span>
      </div>

      {loading && <div className="text-sm text-gray-400">Loading…</div>}
      {error && <div className="text-sm text-red-600">Failed to load roadmap: {error.message}</div>}

      {data && !loading && (
        <>
          <RoadmapGantt
            projects={filteredProjects}
            rangeStart={params.start}
            rangeEnd={params.end}
            showQuarterBand={params.preset === '12m' || !params.preset}
          />
          <UnscheduledList unscheduled={data.unscheduled} />
        </>
      )}
    </div>
  );
}

function Legend({ swatch, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: swatch }} />
      {label}
    </span>
  );
}
```

### Step 8.2: End-to-end visual check

- [ ] With `npm run dev` still running, visit `http://localhost:5173/projects/roadmap`.
- [ ] Expected on first load:
  - Quarter band visible at the top with 4 quarters (Q?'?? · Mon – Mon).
  - Month row below it with 12 month labels.
  - At least one project row (if the DB has any project with start_date + target_date). If the DB is empty, you'll see "No projects in this range." — seed first: `cd server && npm run seed`.
  - A red "Today" line crossing all rows.
  - Project span bar tinted with `project.color`; feature bars tinted by derived health.
  - Tooltip appears on hover; click navigates to `/projects/:id`.
- [ ] Change the range select to "Next 3 months" — quarter band should disappear; months collapse to 3.
- [ ] Click ‹ and › — window shifts; URL updates.
- [ ] Add a status filter — non-matching projects vanish.
- [ ] Reload the page — filters persist (URL params).
- [ ] If a project has no dates, it should appear in the Unscheduled card (click "Unscheduled" to expand).

### Step 8.3: Commit

- [ ] ```bash
git add client/src/pages/ProjectsRoadmapPage.jsx
git commit -m "feat: add ProjectsRoadmapPage with URL-driven filters"
```

---

## Task 9: Final sweep

### Step 9.1: Cross-route smoke test

- [ ] Hit each affected route in order, verifying no console errors in DevTools:
  - `/projects` → redirects to `/projects/board`, board renders.
  - `/projects/board` → kanban with drag works (drag a card between columns; status updates persist after reload).
  - `/projects/roadmap` → Gantt renders as described in Step 8.2.
  - `/projects/<id>` → project detail page loads as before.
  - Sidebar "Projects" link → goes to `/projects` and lands on the last-active tab (default board).

### Step 9.2: Edge cases

- [ ] Pick a project in the seed DB, edit its `target_date` to be **before** today (use the detail page modal). Reload `/projects/roadmap`. Confirm:
  - Any incomplete features in that project that have a target_date in the past show as red bars.
- [ ] Pick a feature, clear its `start_date`. Reload roadmap. Confirm:
  - The feature drops out of its project row.
  - The feature appears under Unscheduled → Features.

### Step 9.3: Self-review of the diff

- [ ] Run `git log main..HEAD --oneline` and confirm 8 commits in order: endpoint, helpers, layout, toolbar, bar, gantt, unscheduled, page.
- [ ] Run `git diff main..HEAD --stat` and confirm only the files in the File Map are touched.

### Step 9.4: PR-ready cleanup commit (if needed)

- [ ] If any console.log statements or stray placeholder text crept in, remove them and commit:

```bash
git add -A
git commit -m "chore: cleanup before PR"
```

---

## Done criteria

- `GET /api/projects/roadmap?start&end` returns the documented JSON shape.
- `/projects/roadmap` renders a 12-month, quarter-grouped Gantt with project + feature bars, today line, working filters, Unscheduled section, and click-through to project detail.
- Board kanban and project detail still work unchanged.
- No new dependencies. No schema changes. No new lint/test infrastructure required.
