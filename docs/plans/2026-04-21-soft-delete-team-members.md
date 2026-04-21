# Soft Delete Team Members — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hard-delete of team members with a soft-delete (`is_active` flag) so historical data is preserved when someone leaves the team.

**Architecture:** Add `is_active INTEGER DEFAULT 1` column to `team_members`. Server filters by active-only by default, with opt-in `?include_inactive=true`. Client hides inactive members from team grid and all dropdowns, with a toggle to reveal former members on the Team page.

**Tech Stack:** Node.js/Express server, React client, SQLite via sql.js

---

### Task 1: Add `is_active` column migration

**Files:**
- Modify: `server/db/init.js:108` (after the last `migrate()` call)

**Step 1: Add the migration call**

In `server/db/init.js`, after line 108 (`migrate('capacity_plan_members', 'exclude_from_points', 'INTEGER DEFAULT 0');`), add:

```javascript
migrate('team_members', 'is_active', 'INTEGER DEFAULT 1');
```

**Step 2: Verify the server starts**

Run: `cd /Users/elmadah/Projects/manager-os/server && node -e "const db = require('./db/init'); db.init().then(() => { console.log('OK'); process.exit(0); })"`
Expected: `OK`

**Step 3: Commit**

```bash
git add server/db/init.js
git commit -m "feat: add is_active column migration for team_members soft delete"
```

---

### Task 2: Update `GET /api/team` to filter by active status

**Files:**
- Modify: `server/routes/team.js:7-26` (the GET `/` handler)

**Step 1: Add `include_inactive` query param support**

Replace the `GET /` handler (lines 7-26) with:

```javascript
// GET /api/team — list all with active story count
router.get('/', (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const activeFilter = includeInactive ? '' : 'WHERE tm.is_active = 1';

    const members = db.prepare(`
      SELECT tm.*,
        COALESCE(s.active_stories, 0) AS active_story_count
      FROM team_members tm
      LEFT JOIN (
        SELECT assignee_id, COUNT(*) AS active_stories
        FROM stories
        WHERE NOT ${doneCondition('status')}
        GROUP BY assignee_id
      ) s ON s.assignee_id = tm.id
      ${activeFilter}
      ORDER BY tm.is_active DESC, tm.name
    `).all();

    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

Note: When `include_inactive=true`, active members sort first (via `ORDER BY tm.is_active DESC`).

**Step 2: Verify manually**

Run: `cd /Users/elmadah/Projects/manager-os && npm run dev`
Visit: `http://localhost:3001/api/team` — should return all members with `is_active: 1`
Visit: `http://localhost:3001/api/team?include_inactive=true` — same result (no inactive members yet)

**Step 3: Commit**

```bash
git add server/routes/team.js
git commit -m "feat: filter GET /api/team by is_active, add include_inactive param"
```

---

### Task 3: Update `PUT /api/team/:id` to support `is_active` field

**Files:**
- Modify: `server/routes/team.js:330-354` (the PUT `/:id` handler)

**Step 1: Add `is_active` to the update query**

Replace the PUT handler (lines 330-354) with:

```javascript
// PUT /api/team/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Team member not found' });

    const { name, role, email, color, is_active } = req.body;
    db.prepare(`
      UPDATE team_members SET
        name = ?, role = ?, email = ?, color = ?, is_active = ?
      WHERE id = ?
    `).run(
      name ?? existing.name,
      role ?? existing.role,
      email ?? existing.email,
      color ?? existing.color,
      is_active !== undefined ? is_active : existing.is_active,
      req.params.id
    );

    const member = db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id);
    res.json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Step 2: Verify manually**

Use curl or the browser console to test:
```bash
curl -X PUT http://localhost:3001/api/team/1 -H 'Content-Type: application/json' -d '{"is_active": 0}'
```
Expected: Response shows the member with `is_active: 0`. Then:
```bash
curl http://localhost:3001/api/team
```
Expected: That member should NOT appear. Then restore:
```bash
curl -X PUT http://localhost:3001/api/team/1 -H 'Content-Type: application/json' -d '{"is_active": 1}'
```

**Step 3: Commit**

```bash
git add server/routes/team.js
git commit -m "feat: allow updating is_active via PUT /api/team/:id"
```

---

### Task 4: Update TeamPage — hide inactive, add toggle

**Files:**
- Modify: `client/src/pages/TeamPage.jsx`

**Step 1: Add state for the toggle and update fetch**

In `TeamPage`, add `showInactive` state and update `loadMembers`:

```javascript
const [showInactive, setShowInactive] = useState(false);

async function loadMembers() {
  try {
    const url = showInactive ? '/team?include_inactive=true' : '/team';
    const data = await api.get(url);
    setMembers(data);
  } catch (err) {
    console.error('Failed to load team:', err);
  } finally {
    setLoading(false);
  }
}

useEffect(() => {
  loadMembers();
}, [showInactive]);
```

Remove the existing separate `useEffect` that calls `loadMembers()`.

**Step 2: Add the toggle button in the header**

In the header `<div>` (between the h1 and the Add button), add:

```jsx
<div className="flex items-center gap-3">
  <button
    onClick={() => setShowInactive(!showInactive)}
    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
      showInactive
        ? 'bg-gray-100 border-gray-300 text-gray-700'
        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
    }`}
  >
    <UserX size={16} />
    {showInactive ? 'Hide' : 'Show'} former members
  </button>
  <button
    onClick={() => setShowAddModal(true)}
    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
  >
    <Plus size={16} />
    Add Team Member
  </button>
</div>
```

Add `UserX` to the lucide-react import at the top of the file.

**Step 3: Style inactive member cards**

In the member card's outer `<div>`, add conditional opacity and a "Left" badge. Replace the card rendering (inside `members.map`) with:

```jsx
{members.map((member) => (
  <div
    key={member.id}
    onClick={() => navigate(`/team/${member.id}`)}
    className={`bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer ${
      !member.is_active ? 'opacity-60' : ''
    }`}
  >
    <div className="flex items-start gap-4">
      {/* Avatar */}
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white ${
          !member.is_active ? 'grayscale' : ''
        }`}
        style={{ backgroundColor: member.color || '#9ca3af' }}
      >
        {getInitials(member.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">{member.name}</h3>
          {!member.is_active && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">Left</span>
          )}
        </div>
        {member.role && (
          <div className="flex items-center gap-1.5 mt-1">
            <Briefcase size={12} className="text-gray-400 shrink-0" />
            <span className="text-sm text-gray-500 truncate">{member.role}</span>
          </div>
        )}
        {member.email && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <Mail size={12} className="text-gray-400 shrink-0" />
            <span className="text-sm text-gray-500 truncate">{member.email}</span>
          </div>
        )}
      </div>
    </div>

    {/* Active stories count */}
    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
      <span className="text-gray-500">Active stories</span>
      <span className={`font-medium ${member.active_story_count > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
        {member.active_story_count}
      </span>
    </div>
  </div>
))}
```

**Step 4: Verify in browser**

Run: `npm run dev` (from root)
Visit: `http://localhost:5173/team`
- Toggle should appear. Clicking it should re-fetch (no inactive members yet, so no visible difference — that's fine).

**Step 5: Commit**

```bash
git add client/src/pages/TeamPage.jsx
git commit -m "feat: add 'Show former members' toggle to TeamPage with inactive styling"
```

---

### Task 5: Update TeamMemberPage — "Mark as Left" / "Restore" actions

**Files:**
- Modify: `client/src/pages/TeamMemberPage.jsx`

**Step 1: Add "Mark as Left" / "Restore" to the header buttons and an inactive banner**

Replace the header action buttons section (lines 199-214) with:

```jsx
<div className="flex items-center gap-2 shrink-0">
  <button
    onClick={() => setShowEdit(true)}
    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
  >
    <Pencil size={14} />
    Edit
  </button>
  {member.is_active ? (
    <button
      onClick={() => setShowDeleteConfirm(true)}
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-orange-600 bg-white border border-orange-200 rounded-lg hover:bg-orange-50"
    >
      <UserMinus size={14} />
      Mark as Left
    </button>
  ) : (
    <button
      onClick={handleRestore}
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-600 bg-white border border-green-200 rounded-lg hover:bg-green-50"
    >
      <UserPlus size={14} />
      Restore
    </button>
  )}
</div>
```

Add `UserMinus` and `UserPlus` to the lucide-react import.

**Step 2: Add an inactive banner below the header**

Right after the closing `</div>` of the header section and before the Tabs section, add:

```jsx
{/* Inactive Banner */}
{!member.is_active && (
  <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-3">
    <UserMinus size={20} className="text-gray-400 shrink-0" />
    <div>
      <p className="text-sm font-medium text-gray-700">This team member has left the team</p>
      <p className="text-xs text-gray-500">Their historical data is preserved. Click "Restore" to make them active again.</p>
    </div>
  </div>
)}
```

**Step 3: Replace `handleDelete` with `handleMarkAsLeft` and add `handleRestore`**

Replace the existing `handleDelete` function (lines 94-101) with:

```javascript
async function handleMarkAsLeft() {
  try {
    await api.put(`/team/${id}`, { is_active: 0 });
    toast.success('Team member marked as left');
    loadData();
  } catch {
    toast.error('Failed to update team member');
  }
}

async function handleRestore() {
  try {
    await api.put(`/team/${id}`, { is_active: 1 });
    toast.success('Team member restored');
    loadData();
  } catch {
    toast.error('Failed to restore team member');
  }
}
```

**Step 4: Update the ConfirmDialog**

Replace the delete confirmation dialog (lines 267-275) with:

```jsx
{showDeleteConfirm && (
  <ConfirmDialog
    title="Mark as Left"
    message={`Mark "${member.name}" as having left the team? Their data will be preserved. You can restore them later.`}
    confirmLabel="Mark as Left"
    onConfirm={() => { handleMarkAsLeft(); setShowDeleteConfirm(false); }}
    onCancel={() => setShowDeleteConfirm(false)}
  />
)}
```

**Step 5: Verify in browser**

Visit: `http://localhost:5173/team/1` (any member)
- Should see "Mark as Left" button (orange, with UserMinus icon)
- Click it → confirmation dialog → confirm → page reloads with inactive banner and "Restore" button
- Go to Team page → member should be hidden
- Toggle "Show former members" → member appears grayed out with "Left" badge
- Click member → "Restore" button visible → click it → member is active again

**Step 6: Commit**

```bash
git add client/src/pages/TeamMemberPage.jsx
git commit -m "feat: replace Delete with Mark as Left / Restore on TeamMemberPage"
```

---

### Task 6: Verify all assignee dropdowns filter correctly

Since all pages that show assignee dropdowns call `api.get('/team')` (which now filters to active-only by default), no code changes are needed. But verify each one works.

**Pages using `api.get('/team')` for dropdowns/selectors:**
- `client/src/pages/ProjectDetailPage.jsx:116` — story assignee dropdown
- `client/src/pages/SprintsPage.jsx:61` — story assignee dropdown
- `client/src/pages/TodosPage.jsx:476` — todo member selector
- `client/src/pages/BlockersPage.jsx:60` — blocker member selector
- `client/src/pages/NotesPage.jsx:80` — notes member filter
- `client/src/pages/HomePage.jsx:42` — dashboard
- `client/src/components/SprintPulse.jsx:70` — sprint pulse
- `client/src/components/NotesPanel.jsx:80` — notes panel

**Step 1: Verify**

With a member marked as inactive:
1. Go to any project detail page → edit a story → assignee dropdown should NOT show inactive member
2. Go to Sprints page → edit a story → same
3. Go to Blockers page → create a blocker → member dropdown should NOT show inactive member

These should all work without changes since the API now filters by default.

**Step 2: Commit (no code changes expected — just a verification step)**

No commit needed.

---

### Task 7: Handle edge case — TeamMemberPage loads member directly

**Files:**
- No changes needed

The `GET /api/team/:id` endpoint fetches by ID directly (`SELECT * FROM team_members WHERE id = ?`) and does NOT filter by `is_active`. This is correct — you need to be able to view an inactive member's detail page (their history, 1:1s, etc). No changes needed here.

---

### Task 8: Final browser walkthrough

**Step 1: Full end-to-end test**

1. Go to `/team` — see all active members, no toggle badge
2. Click a member → "Mark as Left" → confirm
3. Back to `/team` → member is gone
4. Click "Show former members" → member appears with "Left" badge, grayed out
5. Click the inactive member → see inactive banner, "Restore" button
6. Click "Restore" → member is active again
7. Go to a project → edit a story → verify only active members in assignee dropdown
8. Verify all other pages still work normally

**Step 2: Commit any final fixes if needed**
