# Teams & Sprint Board Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "teams" entity that groups team members, Jira boards, and projects together, then add a team filter to the Sprints page so sprint data can be scoped by team.

**Architecture:** New `teams` table with nullable `team_id` FK added to `team_members`, `jira_boards`, and `projects`. New `/api/teams` REST endpoints for CRUD + assignment. Sprints API gets optional `?team_id=` query param that filters through `stories.jira_board_id → jira_boards.team_id`. Settings page gets a Teams management section. Sprints page gets a team dropdown filter.

**Tech Stack:** SQLite (sql.js), Express (CommonJS), React 18, Tailwind CSS v4, lucide-react icons

---

### Task 1: Database Schema & Migrations

**Files:**
- Modify: `server/db/schema.sql:119` (add teams table before jira_boards)
- Modify: `server/db/init.js:79` (add migration lines)

**Step 1: Add teams table to schema.sql**

Add before the `jira_boards` table (line 119):

```sql
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Step 2: Add migrations in init.js**

After the existing Jira migration block (after line 79), add:

```javascript
migrate('team_members', 'team_id', 'INTEGER REFERENCES teams(id)');
migrate('jira_boards', 'team_id', 'INTEGER REFERENCES teams(id)');
migrate('projects', 'team_id', 'INTEGER REFERENCES teams(id)');
```

**Step 3: Verify migrations apply**

Run: `cd /Users/elmadah/Projects/manager-os && cd server && node -e "const db = require('./db/init'); db.init().then(() => { console.log('OK'); process.exit(0); })"`
Expected: "OK" with no errors

**Step 4: Commit**

```bash
git add server/db/schema.sql server/db/init.js
git commit -m "feat: add teams table and team_id FK migrations"
```

---

### Task 2: Teams API Route

**Files:**
- Create: `server/routes/teams.js`
- Modify: `server/index.js:29` (add require + mount)

**Step 1: Create server/routes/teams.js**

```javascript
const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/teams — list all teams with counts
router.get('/', (req, res) => {
  try {
    const teams = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count,
        (SELECT COUNT(*) FROM jira_boards WHERE team_id = t.id) AS board_count,
        (SELECT COUNT(*) FROM projects WHERE team_id = t.id) AS project_count
      FROM teams t
      ORDER BY t.name
    `).all();
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/:id — single team with assigned IDs
router.get('/:id', (req, res) => {
  try {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(req.params.id));
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const members = db.prepare('SELECT id FROM team_members WHERE team_id = ?').all(Number(req.params.id));
    const boards = db.prepare('SELECT id FROM jira_boards WHERE team_id = ?').all(Number(req.params.id));
    const projects = db.prepare('SELECT id FROM projects WHERE team_id = ?').all(Number(req.params.id));

    res.json({
      ...team,
      member_ids: members.map(m => m.id),
      board_ids: boards.map(b => b.id),
      project_ids: projects.map(p => p.id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teams — create team
router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const result = db.prepare('INSERT INTO teams (name) VALUES (?)').run(name.trim());
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/teams/:id — update team name
router.put('/:id', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(name.trim(), Number(req.params.id));
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(req.params.id));
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/teams/:id/assignments — bulk assign members, boards, projects
router.put('/:id/assignments', (req, res) => {
  try {
    const teamId = Number(req.params.id);
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const { member_ids = [], board_ids = [], project_ids = [] } = req.body;

    const assign = db.transaction(() => {
      // Clear previous assignments for this team, then set new ones
      db.prepare('UPDATE team_members SET team_id = NULL WHERE team_id = ?').run(teamId);
      for (const id of member_ids) {
        db.prepare('UPDATE team_members SET team_id = ? WHERE id = ?').run(teamId, id);
      }

      db.prepare('UPDATE jira_boards SET team_id = NULL WHERE team_id = ?').run(teamId);
      for (const id of board_ids) {
        db.prepare('UPDATE jira_boards SET team_id = ? WHERE id = ?').run(teamId, id);
      }

      db.prepare('UPDATE projects SET team_id = NULL WHERE team_id = ?').run(teamId);
      for (const id of project_ids) {
        db.prepare('UPDATE projects SET team_id = ? WHERE id = ?').run(teamId, id);
      }
    });

    assign();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/teams/:id — delete team (nullify children)
router.delete('/:id', (req, res) => {
  try {
    const teamId = Number(req.params.id);
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const remove = db.transaction(() => {
      db.prepare('UPDATE team_members SET team_id = NULL WHERE team_id = ?').run(teamId);
      db.prepare('UPDATE jira_boards SET team_id = NULL WHERE team_id = ?').run(teamId);
      db.prepare('UPDATE projects SET team_id = NULL WHERE team_id = ?').run(teamId);
      db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);
    });

    remove();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

**Step 2: Mount in server/index.js**

After `const jiraSettingsRouter = require('./routes/jiraSettings');` (line 29), add:

```javascript
const teamsRouter = require('./routes/teams');
```

After `app.use('/api/settings/jira', jiraSettingsRouter);` (line 45), add:

```javascript
app.use('/api/teams', teamsRouter);
```

**Step 3: Verify route loads**

Run: `cd /Users/elmadah/Projects/manager-os && cd server && node -e "const db = require('./db/init'); db.init().then(() => { const app = require('express')(); app.use(require('./routes/teams')); console.log('OK'); process.exit(0); })"`
Expected: "OK"

**Step 4: Commit**

```bash
git add server/routes/teams.js server/index.js
git commit -m "feat: add teams CRUD API with bulk assignment endpoint"
```

---

### Task 3: Add Team Filter to Sprints API

**Files:**
- Modify: `server/routes/sprints.js` (both GET endpoints)

**Step 1: Update GET /api/sprints to support ?team_id filter**

In the `GET /` handler, after reading `req.query`, build a conditional JOIN + WHERE clause. When `team_id` is provided, only include sprints that have stories linked to boards belonging to that team.

Replace the sprints query (lines 15-22) with:

```javascript
const teamId = req.query.team_id ? Number(req.query.team_id) : null;

const teamFilter = teamId
  ? `AND ssh.story_id IN (
      SELECT s.id FROM stories s
      JOIN jira_boards jb ON jb.id = s.jira_board_id
      WHERE jb.team_id = ${teamId}
    )`
  : '';

const sprints = db.prepare(`
  SELECT sprint,
    MAX(imported_at) AS last_imported
  FROM story_sprint_history ssh
  WHERE sprint IS NOT NULL AND sprint != ''
  ${teamFilter}
  GROUP BY sprint
  ORDER BY MAX(imported_at) DESC
`).all();
```

Also update the `allStories` query inside the `.map()` callback to apply the same team filter:

```javascript
const allStories = db.prepare(`
  SELECT DISTINCT ssh.story_id, st.status, st.story_points, st.first_seen_sprint, st.carry_over_count
  FROM story_sprint_history ssh
  JOIN stories st ON st.id = ssh.story_id
  ${teamId ? 'JOIN jira_boards jb ON jb.id = st.jira_board_id' : ''}
  WHERE ssh.sprint = ?
  ${teamId ? 'AND jb.team_id = ' + teamId : ''}
`).all(sprintName);
```

**Step 2: Update GET /api/sprints/:sprintName/stories to support ?team_id filter**

Add team filter to the stories query (lines 92-109). When `team_id` is provided, add a JOIN to `jira_boards` and a WHERE clause:

```javascript
const teamId = req.query.team_id ? Number(req.query.team_id) : null;

const stories = db.prepare(`
  SELECT DISTINCT
    st.id, st.key, st.summary, st.status AS current_status, st.story_points,
    st.first_seen_sprint, st.carry_over_count, st.sprints_to_complete,
    st.assignee_id, st.feature_id,
    tm.name AS assignee,
    f.name AS feature_name,
    p.name AS project_name,
    ssh.status AS sprint_status_raw
  FROM story_sprint_history ssh
  JOIN stories st ON st.id = ssh.story_id
  LEFT JOIN team_members tm ON tm.id = st.assignee_id
  LEFT JOIN features f ON f.id = st.feature_id
  LEFT JOIN projects p ON p.id = f.project_id
  ${teamId ? 'JOIN jira_boards jb ON jb.id = st.jira_board_id' : ''}
  WHERE ssh.sprint = ?
  ${teamId ? 'AND jb.team_id = ' + teamId : ''}
  GROUP BY st.id
  ORDER BY st.key
`).all(sprintName);
```

**Step 3: Commit**

```bash
git add server/routes/sprints.js
git commit -m "feat: add team_id query filter to sprints API endpoints"
```

---

### Task 4: Teams Management Section in Settings Page

**Files:**
- Modify: `client/src/pages/SettingsPage.jsx`

**Step 1: Add teams state and data loading**

Add these state variables after the sync modal state (after line 37):

```javascript
// Teams state
const [teams, setTeams] = useState([]);
const [allMembers, setAllMembers] = useState([]);
const [allProjects, setAllProjects] = useState([]);
const [showAddTeam, setShowAddTeam] = useState(false);
const [newTeamName, setNewTeamName] = useState('');
const [addingTeam, setAddingTeam] = useState(false);
const [editingTeam, setEditingTeam] = useState(null); // team id being edited
const [editAssignments, setEditAssignments] = useState({ member_ids: [], board_ids: [], project_ids: [] });
const [savingAssignments, setSavingAssignments] = useState(false);
```

Add a `loadTeams` function and call it from the existing `useEffect`:

```javascript
async function loadTeams() {
  try {
    const [teamsData, membersData, projectsData] = await Promise.all([
      api.get('/teams'),
      api.get('/team'),
      api.get('/projects'),
    ]);
    setTeams(teamsData);
    setAllMembers(membersData);
    setAllProjects(projectsData);
  } catch {
    // ignore
  }
}
```

Call `loadTeams()` inside the existing `loadSettings()` function (or in the same useEffect).

**Step 2: Add team CRUD handlers**

```javascript
async function handleAddTeam() {
  if (!newTeamName.trim()) return;
  setAddingTeam(true);
  try {
    const team = await api.post('/teams', { name: newTeamName.trim() });
    setTeams(prev => [...prev, { ...team, member_count: 0, board_count: 0, project_count: 0 }]);
    setNewTeamName('');
    setShowAddTeam(false);
    toast.success('Team created');
  } catch (err) {
    toast.error(err.data?.error || 'Failed to create team');
  } finally {
    setAddingTeam(false);
  }
}

async function handleDeleteTeam(id) {
  try {
    await api.del(`/teams/${id}`);
    setTeams(prev => prev.filter(t => t.id !== id));
    if (editingTeam === id) setEditingTeam(null);
    toast.success('Team deleted');
  } catch (err) {
    toast.error(err.data?.error || 'Failed to delete team');
  }
}

async function handleEditTeam(id) {
  if (editingTeam === id) {
    setEditingTeam(null);
    return;
  }
  try {
    const data = await api.get(`/teams/${id}`);
    setEditAssignments({
      member_ids: data.member_ids || [],
      board_ids: data.board_ids || [],
      project_ids: data.project_ids || [],
    });
    setEditingTeam(id);
  } catch (err) {
    toast.error('Failed to load team details');
  }
}

async function handleSaveAssignments() {
  setSavingAssignments(true);
  try {
    await api.put(`/teams/${editingTeam}/assignments`, editAssignments);
    toast.success('Assignments saved');
    await loadTeams();
    setEditingTeam(null);
  } catch (err) {
    toast.error(err.data?.error || 'Failed to save assignments');
  } finally {
    setSavingAssignments(false);
  }
}

function toggleAssignment(type, id) {
  setEditAssignments(prev => {
    const key = type;
    const current = prev[key];
    return {
      ...prev,
      [key]: current.includes(id) ? current.filter(x => x !== id) : [...current, id],
    };
  });
}
```

**Step 3: Add Teams UI section**

Add after the Boards section closing `</div>` (after line 356), before the Sync Modal:

```jsx
{/* Teams */}
<div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
  <div className="flex items-center justify-between mb-4">
    <div>
      <h2 className="text-lg font-semibold text-gray-900">Teams</h2>
      <p className="text-sm text-gray-500">Group members, boards, and projects into teams</p>
    </div>
    <button
      onClick={() => setShowAddTeam(true)}
      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-1.5"
    >
      <Plus className="w-4 h-4" />
      Add Team
    </button>
  </div>

  {showAddTeam && (
    <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Team Name</label>
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="e.g. Mobile Team"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
          />
        </div>
        <button
          onClick={handleAddTeam}
          disabled={addingTeam || !newTeamName.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
        >
          {addingTeam ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
        </button>
        <button
          onClick={() => { setShowAddTeam(false); setNewTeamName(''); }}
          className="px-2 py-2 text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )}

  {teams.length > 0 ? (
    <div className="divide-y divide-gray-100">
      {teams.map((team) => (
        <div key={team.id} className="py-3">
          <div className="flex items-center justify-between">
            <div className="cursor-pointer" onClick={() => handleEditTeam(team.id)}>
              <p className="text-sm font-medium text-gray-900">{team.name}</p>
              <p className="text-xs text-gray-500">
                {team.member_count} members · {team.board_count} boards · {team.project_count} projects
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleEditTeam(team.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  editingTeam === team.id
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {editingTeam === team.id ? 'Close' : 'Edit'}
              </button>
              <button
                onClick={() => handleDeleteTeam(team.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Assignments Editor */}
          {editingTeam === team.id && (
            <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
              {/* Members */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Members</label>
                <div className="flex flex-wrap gap-2">
                  {allMembers.map(m => {
                    const assigned = editAssignments.member_ids.includes(m.id);
                    const otherTeam = !assigned && m.team_id && m.team_id !== team.id
                      ? teams.find(t => t.id === m.team_id)
                      : null;
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggleAssignment('member_ids', m.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          assigned
                            ? 'bg-blue-100 border-blue-300 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                        }`}
                      >
                        {m.name}
                        {otherTeam && <span className="ml-1 text-gray-400">({otherTeam.name})</span>}
                      </button>
                    );
                  })}
                  {allMembers.length === 0 && <span className="text-xs text-gray-400">No team members yet</span>}
                </div>
              </div>

              {/* Boards */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Boards</label>
                <div className="flex flex-wrap gap-2">
                  {boards.map(b => {
                    const assigned = editAssignments.board_ids.includes(b.id);
                    const otherTeam = !assigned && b.team_id && b.team_id !== team.id
                      ? teams.find(t => t.id === b.team_id)
                      : null;
                    return (
                      <button
                        key={b.id}
                        onClick={() => toggleAssignment('board_ids', b.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          assigned
                            ? 'bg-blue-100 border-blue-300 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                        }`}
                      >
                        {b.label}
                        {otherTeam && <span className="ml-1 text-gray-400">({otherTeam.name})</span>}
                      </button>
                    );
                  })}
                  {boards.length === 0 && <span className="text-xs text-gray-400">No boards registered yet</span>}
                </div>
              </div>

              {/* Projects */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Projects</label>
                <div className="flex flex-wrap gap-2">
                  {allProjects.map(p => {
                    const assigned = editAssignments.project_ids.includes(p.id);
                    const otherTeam = !assigned && p.team_id && p.team_id !== team.id
                      ? teams.find(t => t.id === p.team_id)
                      : null;
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleAssignment('project_ids', p.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          assigned
                            ? 'bg-blue-100 border-blue-300 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                        }`}
                      >
                        {p.name}
                        {otherTeam && <span className="ml-1 text-gray-400">({otherTeam.name})</span>}
                      </button>
                    );
                  })}
                  {allProjects.length === 0 && <span className="text-xs text-gray-400">No projects yet</span>}
                </div>
              </div>

              <button
                onClick={handleSaveAssignments}
                disabled={savingAssignments}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {savingAssignments ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Assignments
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  ) : (
    <p className="text-sm text-gray-500 text-center py-6">
      No teams yet. Create a team to group members, boards, and projects.
    </p>
  )}
</div>
```

**Step 4: Commit**

```bash
git add client/src/pages/SettingsPage.jsx
git commit -m "feat: add teams management section to Settings page"
```

---

### Task 5: Team Filter on Sprints Page

**Files:**
- Modify: `client/src/pages/SprintsPage.jsx`

**Step 1: Add teams state and fetch**

Add after existing state declarations (after line 11):

```javascript
const [teams, setTeams] = useState([]);
const [selectedTeamId, setSelectedTeamId] = useState('');
```

Add a useEffect to load teams:

```javascript
useEffect(() => {
  api.get('/teams').then(setTeams).catch(() => {});
}, []);
```

**Step 2: Pass team_id to API calls**

Update the sprints loading useEffect (lines 14-29) — add `selectedTeamId` as a dependency and include the query param:

```javascript
useEffect(() => {
  async function loadSprints() {
    try {
      const params = selectedTeamId ? `?team_id=${selectedTeamId}` : '';
      const data = await api.get(`/sprints${params}`);
      setSprints(data);
      if (data.length > 0) {
        setSelectedSprint(data[0]);
      } else {
        setSelectedSprint(null);
        setStories([]);
      }
    } catch (err) {
      console.error('Failed to load sprints:', err);
    } finally {
      setLoading(false);
    }
  }
  loadSprints();
}, [selectedTeamId]);
```

Update the stories loading useEffect (lines 31-45) — include team_id:

```javascript
useEffect(() => {
  if (!selectedSprint) return;
  async function loadStories() {
    setStoriesLoading(true);
    try {
      const params = selectedTeamId ? `?team_id=${selectedTeamId}` : '';
      const data = await api.get(`/sprints/${encodeURIComponent(selectedSprint.sprint)}/stories${params}`);
      setStories(data);
    } catch (err) {
      console.error('Failed to load sprint stories:', err);
    } finally {
      setStoriesLoading(false);
    }
  }
  loadStories();
}, [selectedSprint, selectedTeamId]);
```

**Step 3: Add team dropdown to the header**

In the header area (around line 79-92), add a team selector next to the Sprint Comparison button:

```jsx
<div className="flex items-center justify-between mb-8">
  <h1 className="text-3xl font-bold text-gray-900">Sprints</h1>
  <div className="flex items-center gap-3">
    {teams.length > 0 && (
      <div className="relative">
        <select
          value={selectedTeamId}
          onChange={(e) => setSelectedTeamId(e.target.value)}
          className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-10 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
        >
          <option value="">All Teams</option>
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
    )}
    <button
      onClick={() => setShowComparison(!showComparison)}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        showComparison
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      <BarChart3 size={16} />
      Sprint Comparison
    </button>
  </div>
</div>
```

**Step 4: Commit**

```bash
git add client/src/pages/SprintsPage.jsx
git commit -m "feat: add team filter dropdown to Sprints page"
```

---

### Task 6: Smoke Test & Final Verification

**Step 1: Start the dev servers**

Run: `cd /Users/elmadah/Projects/manager-os && npm run dev`

**Step 2: Verify the following in browser**

1. Settings page → Teams section visible, can create a team
2. Can assign boards/members/projects to a team
3. Sprints page → Team dropdown appears when teams exist
4. Selecting a team filters sprint data
5. "All Teams" shows unfiltered data
6. Existing data (no team assignments) continues to work

**Step 3: Commit any fixes if needed**
