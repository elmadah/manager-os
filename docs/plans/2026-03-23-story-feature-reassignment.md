# Story Project/Feature Reassignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to reassign stories to a different project/feature after Jira import, from both the Project Detail page and the Sprints page.

**Architecture:** Extract `StoryEditModal` into a shared component, add cascading project→feature dropdowns, wire `feature_id` through the existing `PUT /api/stories/:id` endpoint. Both SprintsPage and ProjectDetailPage use the same modal.

**Tech Stack:** React, Express, SQLite (sql.js), Tailwind CSS

---

### Task 1: Backend — Accept `feature_id` in PUT /api/stories/:id

**Files:**
- Modify: `server/routes/features.js:155-187`

**Step 1: Update the PUT endpoint to accept and persist `feature_id`**

In `server/routes/features.js`, modify the `PUT /stories/:id` handler:

```javascript
// PUT /api/stories/:id
router.put('/stories/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Story not found' });

    const { summary, sprint, status, assignee_id, story_points, release_date, feature_id } = req.body;
    db.prepare(`
      UPDATE stories SET
        summary = ?, sprint = ?, status = ?, assignee_id = ?,
        story_points = ?, release_date = ?, feature_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      summary ?? existing.summary,
      sprint ?? existing.sprint,
      status ?? existing.status,
      assignee_id !== undefined ? assignee_id : existing.assignee_id,
      story_points ?? existing.story_points,
      release_date !== undefined ? release_date : existing.release_date,
      feature_id !== undefined ? feature_id : existing.feature_id,
      req.params.id
    );

    const story = db.prepare(`
      SELECT s.*, tm.name AS assignee_name,
        f.name AS feature_name, p.name AS project_name, p.id AS project_id
      FROM stories s
      LEFT JOIN team_members tm ON tm.id = s.assignee_id
      LEFT JOIN features f ON f.id = s.feature_id
      LEFT JOIN projects p ON p.id = f.project_id
      WHERE s.id = ?
    `).get(req.params.id);
    res.json(story);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

Key changes:
- Destructure `feature_id` from `req.body`
- Add `feature_id = ?` to the UPDATE SET clause
- Use `feature_id !== undefined ? feature_id : existing.feature_id` (same null-safe pattern as `assignee_id`)
- Return `feature_name`, `project_name`, and `project_id` in the response via JOINs

**Step 2: Manually test with curl**

```bash
# Test reassigning a story to a feature (use real IDs from your DB)
curl -X PUT http://localhost:3001/api/stories/1 \
  -H 'Content-Type: application/json' \
  -d '{"feature_id": 2}'
```

Expected: 200 response with story including `feature_name` and `project_name` from the new feature.

**Step 3: Commit**

```bash
git add server/routes/features.js
git commit -m "feat: accept feature_id in PUT /api/stories/:id for reassignment"
```

---

### Task 2: Extract StoryEditModal into shared component

**Files:**
- Create: `client/src/components/StoryEditModal.jsx`
- Modify: `client/src/pages/ProjectDetailPage.jsx:846-986`

**Step 1: Create the shared component file**

Create `client/src/components/StoryEditModal.jsx` with the existing modal code from `ProjectDetailPage.jsx` lines 846-986, plus new project/feature dropdowns:

```jsx
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '../lib/api';

export default function StoryEditModal({ story, teamMembers, onClose, onSave }) {
  const [form, setForm] = useState({
    summary: story.summary || '',
    sprint: story.sprint || '',
    status: story.status || '',
    assignee_id: story.assignee_id || '',
    story_points: story.story_points ?? '',
    release_date: story.release_date || '',
    feature_id: story.feature_id || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // Load projects with their features on mount
  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await api.get('/projects');
        setProjects(data);

        // Set initial project based on story's current feature
        if (story.feature_id) {
          const ownerProject = data.find(p =>
            p.features && p.features.some(f => f.id === story.feature_id)
          );
          if (ownerProject) {
            setSelectedProjectId(String(ownerProject.id));
          }
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
      }
    }
    loadProjects();
  }, [story.feature_id]);

  // Get features for selected project
  const featuresForProject = selectedProjectId
    ? (projects.find(p => p.id === Number(selectedProjectId))?.features || [])
    : [];

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function handleProjectChange(e) {
    const projectId = e.target.value;
    setSelectedProjectId(projectId);
    // Reset feature when project changes
    setForm(prev => ({ ...prev, feature_id: '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    await onSave(story.id, {
      ...form,
      assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
      story_points: form.story_points !== '' ? Number(form.story_points) : null,
      release_date: form.release_date || null,
      feature_id: form.feature_id ? Number(form.feature_id) : null,
    });
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Edit Story</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">
          {story.key}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project / Feature Assignment */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select
                value={selectedProjectId}
                onChange={handleProjectChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">Unassigned</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Feature</label>
              <select
                name="feature_id"
                value={form.feature_id}
                onChange={handleChange}
                disabled={!selectedProjectId}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">Unassigned</option>
                {featuresForProject.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Summary *</label>
            <input
              name="summary"
              value={form.summary}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">—</option>
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="In Review">In Review</option>
                <option value="Done">Done</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Points</label>
              <input
                name="story_points"
                type="number"
                min="0"
                value={form.story_points}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sprint</label>
              <input
                name="sprint"
                value={form.sprint}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
              <select
                name="assignee_id"
                value={form.assignee_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">Unassigned</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Release Date</label>
            <input
              type="date"
              name="release_date"
              value={form.release_date}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Update ProjectDetailPage to import the shared component**

In `client/src/pages/ProjectDetailPage.jsx`:
1. Add import at the top: `import StoryEditModal from '../components/StoryEditModal';`
2. Delete the local `StoryEditModal` function (lines 846-986)
3. The existing `<StoryEditModal>` usage at line 474-480 stays unchanged — same props

**Step 3: Verify the Project Detail page still works**

Run: `npm run dev` and open a project detail page. Click edit on a story. Confirm the modal opens with the new Project/Feature dropdowns pre-populated, and saving works.

**Step 4: Commit**

```bash
git add client/src/components/StoryEditModal.jsx client/src/pages/ProjectDetailPage.jsx
git commit -m "refactor: extract StoryEditModal into shared component with project/feature dropdowns"
```

---

### Task 3: Check that `/api/projects` returns features

**Files:**
- Possibly modify: `server/routes/projects.js`

The `StoryEditModal` calls `api.get('/projects')` and expects each project to have a `features` array. Check what `GET /api/projects` returns.

**Step 1: Verify the projects endpoint**

Read `server/routes/projects.js` and check the `GET /` handler. If it returns projects with their features array, no changes needed. If not, the response needs to include features.

The `GET /api/projects/:id` endpoint (used by ProjectDetailPage) already returns features. The list endpoint may not. If it doesn't, add a features array to each project in the list response:

```javascript
// After fetching projects, attach features to each
const features = db.prepare('SELECT * FROM features WHERE project_id = ?');
const enriched = projects.map(p => ({
  ...p,
  features: features.all(p.id),
}));
res.json(enriched);
```

**Step 2: Commit if changes were needed**

```bash
git add server/routes/projects.js
git commit -m "feat: include features in GET /api/projects list response"
```

---

### Task 4: Add story editing to SprintsPage — both views

**Files:**
- Modify: `client/src/pages/SprintsPage.jsx`
- Modify: `client/src/components/SprintListView.jsx`

**Step 1: Add state and handlers to SprintsPage**

In `client/src/pages/SprintsPage.jsx`:

1. Add imports at top:
```jsx
import { Pencil } from 'lucide-react';
import StoryEditModal from '../components/StoryEditModal';
```

2. Add state variables after existing state:
```jsx
const [editingStory, setEditingStory] = useState(null);
const [teamMembers, setTeamMembers] = useState([]);
```

3. Load team members in the first `useEffect` (alongside teams and jira settings):
```jsx
api.get('/team').then(setTeamMembers).catch(() => {});
```

4. Add a save handler:
```jsx
async function handleUpdateStory(storyId, data) {
  try {
    await api.put(`/stories/${storyId}`, data);
    // Refresh stories for current sprint
    const params = selectedTeamId ? `?team_id=${selectedTeamId}` : '';
    const refreshed = await api.get(`/sprints/${encodeURIComponent(selectedSprint.sprint)}/stories${params}`);
    setStories(refreshed);
    setEditingStory(null);
  } catch (err) {
    console.error('Failed to update story:', err);
  }
}
```

5. Render the modal (add before the closing `</div>` of the return):
```jsx
{editingStory && (
  <StoryEditModal
    story={editingStory}
    teamMembers={teamMembers}
    onClose={() => setEditingStory(null)}
    onSave={handleUpdateStory}
  />
)}
```

**Step 2: Add edit button to the Status view (StorySection/renderCell)**

In `SprintsPage.jsx`, the `StorySection` and `renderCell` are local functions. They don't have access to `setEditingStory`. Two approaches:

Pass `onEditStory` prop through `StorySection`:
- Add `onEditStory` prop to `StorySection`
- Add an 'actions' column to each StorySection's columns array
- In `renderCell`, add a case for 'actions' that renders a pencil icon button
- The button calls `onEditStory(story)`

Update `StorySection` signature and pass through:
```jsx
function StorySection({ title, icon, color, stories, columns, onEditStory }) {
```

In the `<tbody>`, each row's cells are rendered from columns. Add 'actions' to the columns arrays in the JSX:

```jsx
<StorySection
  title="Completed"
  icon={<CheckCircle2 size={18} />}
  color="green"
  stories={completed}
  columns={['key', 'summary', 'assignee', 'feature', 'project', 'points', 'sprints_to_complete', 'actions']}
  onEditStory={setEditingStory}
/>
```

Update `renderCell` to accept `onEditStory`:
```jsx
function renderCell(col, story, onEditStory) {
  // ... existing cases ...
  case 'actions':
    return (
      <button
        onClick={() => onEditStory(story)}
        className="text-gray-400 hover:text-blue-600 transition-colors"
        title="Edit story"
      >
        <Pencil size={14} />
      </button>
    );
}
```

Update the call site in `StorySection`:
```jsx
{columns.map(col => (
  <td key={col} className="px-5 py-3">
    {renderCell(col, story, onEditStory)}
  </td>
))}
```

Add 'actions' to `columnHeaders`:
```jsx
const columnHeaders = {
  // ... existing ...
  actions: '',
};
```

**Step 3: Add edit button to SprintListView (project view)**

In `client/src/components/SprintListView.jsx`:

1. Add import: `import { Pencil } from 'lucide-react';` (alongside existing imports)
2. Accept `onEditStory` prop: `export default function SprintListView({ stories, searchQuery, jiraBaseUrl, onEditStory })`
3. In the Actions column cell (line 251-265), add a pencil button before the Jira link:

```jsx
<td className="px-5 py-2.5 text-center">
  <div className="inline-flex items-center gap-2">
    {onEditStory && (
      <button
        onClick={() => onEditStory(story)}
        className="text-gray-400 hover:text-blue-600 transition-colors"
        title="Edit story"
      >
        <Pencil size={14} />
      </button>
    )}
    {jiraBaseUrl && story.key ? (
      <a
        href={`${jiraBaseUrl}/browse/${story.key}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center text-gray-400 hover:text-blue-600 transition-colors"
        title="Open in Jira"
      >
        <ExternalLink size={14} />
      </a>
    ) : (
      <span className="text-gray-300">—</span>
    )}
  </div>
</td>
```

4. Update SprintsPage to pass the prop:
```jsx
<SprintListView stories={stories} searchQuery={searchQuery} jiraBaseUrl={jiraBaseUrl} onEditStory={setEditingStory} />
```

**Step 4: Verify both views work**

Run: `npm run dev`, go to Sprints page.
- In "By Status" view: confirm pencil icon appears in each story row, clicking opens edit modal with project/feature dropdowns
- In "By Project" view: confirm pencil icon appears next to Jira link, clicking opens edit modal
- Change a story's project/feature, save, confirm the story moves to the correct project group

**Step 5: Commit**

```bash
git add client/src/pages/SprintsPage.jsx client/src/components/SprintListView.jsx
git commit -m "feat: add story editing with project/feature reassignment to sprints page"
```

---

### Task 5: Handle edge case — story with project_id on sprint data

**Files:**
- Modify: `client/src/components/StoryEditModal.jsx` (possibly)

The sprint stories API returns `project_name` and `project_color` but not `project_id` directly on the story. The `StoryEditModal` needs to resolve the initial project from `story.feature_id`. Check that the modal's `useEffect` correctly finds the project via `story.feature_id` even when `story.project_id` isn't set.

The current implementation in Task 2 already handles this: it loads all projects with features, then finds which project contains the story's `feature_id`. No changes needed if that works.

**Step 1: Test with an unassigned story**

Open a story that has no `feature_id` (unassigned). Confirm:
- Both dropdowns show "Unassigned"
- Feature dropdown is disabled when no project is selected
- Selecting a project enables the feature dropdown
- Saving with a new feature_id works

**Step 2: Test reassignment**

Open a story assigned to Project A / Feature X. Change to Project B / Feature Y. Save. Confirm the story now shows under Project B in the sprint list view.

**Step 3: Commit if any fixes were needed**

```bash
git add client/src/components/StoryEditModal.jsx
git commit -m "fix: handle edge cases in story feature reassignment"
```
