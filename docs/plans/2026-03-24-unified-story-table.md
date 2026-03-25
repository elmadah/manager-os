# Unified StoryTable Component — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a single reusable `StoryTable` component with configurable columns that replaces the three separate story table implementations across Sprint "By Project" view, Project Detail feature stories, and Team Member active work.

**Architecture:** Extract a `StoryTable` component that accepts a column config array and callback props. Each consumer passes only the columns and actions it needs. Shared utilities (IssueTypeIcon, status rendering, sort logic) live alongside the component. The Sprint "By Project" view retains its grouping shell but delegates table rendering to `StoryTable`. Project Detail and Team Member pages swap their inline tables for `StoryTable`.

**Tech Stack:** React 18, Tailwind CSS v4, lucide-react icons

---

### Task 1: Create the shared StoryTable component

**Files:**
- Create: `client/src/components/StoryTable.jsx`

**Step 1: Create `StoryTable.jsx` with full implementation**

This component handles: column config, sorting, issue type icons, inline status colors, carry-over display, and actions (Edit, Jira, Delete).

```jsx
import { useState, useMemo } from 'react';
import { ArrowUp, ArrowDown, Pencil, ExternalLink, Trash2, BookOpen, Bug } from 'lucide-react';

// Shared status priority for sorting
const STATUS_PRIORITY = {
  'in progress': 0, 'in_progress': 0,
  'in review': 1, 'code review': 1,
  'to do': 2, 'todo': 2, 'open': 2,
  'done': 3, 'closed': 3,
};

function getStatusPriority(status) {
  if (!status) return 99;
  return STATUS_PRIORITY[status.toLowerCase()] ?? 50;
}

function isDone(status) {
  if (!status) return false;
  const lower = status.toLowerCase();
  return lower === 'done' || lower === 'closed' || lower === 'resolved';
}

// Status color mapping (inline colored text style)
function getStatusColor(status) {
  if (!status) return 'text-gray-400';
  const lower = status.toLowerCase();
  if (lower === 'in progress' || lower === 'in_progress') return 'text-blue-600 font-medium';
  if (lower === 'in review' || lower === 'code review') return 'text-purple-600 font-medium';
  if (isDone(lower)) return 'text-green-600 font-medium';
  if (lower === 'to do' || lower === 'todo' || lower === 'open') return 'text-gray-600';
  return 'text-gray-600';
}

export function IssueTypeIcon({ issueType }) {
  const type = (issueType || '').toLowerCase();
  if (type === 'bug' || type === 'defect') {
    return <Bug size={14} className="text-red-500 shrink-0" title="Bug" />;
  }
  return <BookOpen size={14} className="text-green-600 shrink-0" title="Story" />;
}

/**
 * Available column keys:
 * - key: Story key with issue type icon
 * - summary: Story summary (truncated)
 * - status: Inline colored status text
 * - assignee: Assignee name (plain text, or pass renderAssignee for custom)
 * - story_points: Points (right-aligned)
 * - release_date: Release date
 * - carry_over_count: Carry-over count with color coding
 * - sprint: Sprint name
 * - feature_name: Feature name
 * - project_name: Project name (plain text, or pass renderProject for custom)
 * - actions: Edit / Jira / Delete buttons
 */

const DEFAULT_SORT = { key: null, direction: 'asc' };

export default function StoryTable({
  stories,
  columns,
  defaultSort = DEFAULT_SORT,
  sortable = true,
  // Action callbacks — actions column auto-shows based on what's provided
  onEdit,
  onDelete,
  jiraBaseUrl,
  // Optional custom cell renderers keyed by column key
  renderCell,
  // Row class override
  rowClassName,
  // Table wrapper class
  className = '',
  // Compact mode (less padding, for nested tables)
  compact = false,
}) {
  const [sortConfig, setSortConfig] = useState(defaultSort);

  const px = compact ? 'px-3' : 'px-5';
  const py = compact ? 'py-2' : 'py-2.5';

  const sortedStories = useMemo(() => {
    if (!sortConfig.key) return stories;
    return [...stories].sort((a, b) => {
      const { key, direction } = sortConfig;
      const mult = direction === 'asc' ? 1 : -1;

      if (key === 'status') {
        return mult * (getStatusPriority(a.status) - getStatusPriority(b.status));
      }
      if (key === 'story_points' || key === 'carry_over_count') {
        return mult * ((a[key] || 0) - (b[key] || 0));
      }
      const aVal = (a[key] || '').toString().toLowerCase();
      const bVal = (b[key] || '').toString().toLowerCase();
      return mult * aVal.localeCompare(bVal);
    });
  }, [stories, sortConfig]);

  function handleSort(key) {
    if (!sortable) return;
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  // Check if actions column should appear
  const hasActions = onEdit || onDelete || jiraBaseUrl;

  // Build effective columns list
  const effectiveColumns = columns.map(col => {
    if (col.key === 'actions' && !hasActions) return null;
    return col;
  }).filter(Boolean);

  function renderCellContent(col, story) {
    // Custom renderer takes priority
    if (renderCell && renderCell[col.key]) {
      return renderCell[col.key](story);
    }

    switch (col.key) {
      case 'key':
        return (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-blue-600 font-medium">
            <IssueTypeIcon issueType={story.issue_type} />
            {story.key}
          </span>
        );
      case 'summary':
        return (
          <span className="text-gray-900 truncate block" title={story.summary}>
            {story.summary && story.summary.length > 60
              ? story.summary.slice(0, 60) + '…'
              : story.summary}
          </span>
        );
      case 'status':
        if (!story.status) return <span className="text-gray-400">—</span>;
        return <span className={`text-xs ${getStatusColor(story.status)}`}>{story.status}</span>;
      case 'assignee':
        return <span className="text-gray-600 text-xs">{story.assignee || story.assignee_name || '—'}</span>;
      case 'story_points':
        return <span className="font-medium text-gray-900">{story.story_points || '—'}</span>;
      case 'release_date':
        return (
          <span className="text-gray-600 text-xs">
            {story.release_date
              ? new Date(story.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : '—'}
          </span>
        );
      case 'carry_over_count': {
        const count = story.carry_over_count || 0;
        return (
          <span className={`font-medium ${
            count >= 3 ? 'text-red-600 font-bold' : count > 0 ? 'text-orange-600' : 'text-gray-400'
          }`}>
            {count}
          </span>
        );
      }
      case 'sprint':
        return <span className="text-gray-600 text-xs">{story.sprint || '—'}</span>;
      case 'feature_name':
        return <span className="text-gray-600 text-xs">{story.feature_name || '—'}</span>;
      case 'project_name':
        return <span className="text-gray-600 text-xs">{story.project_name || '—'}</span>;
      case 'actions':
        return (
          <div className="inline-flex items-center gap-2">
            {onEdit && (
              <button
                onClick={() => onEdit(story)}
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
            ) : null}
            {onDelete && (
              <button
                onClick={() => onDelete(story)}
                className="text-gray-400 hover:text-red-600 transition-colors"
                title="Delete story"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      default:
        return <span className="text-gray-600 text-xs">{story[col.key] ?? '—'}</span>;
    }
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {effectiveColumns.map(col => {
              const isSortable = sortable && col.sortable !== false && col.key !== 'actions';
              return (
                <th
                  key={col.key}
                  className={`${px} ${py} text-xs font-medium text-gray-500 uppercase tracking-wide ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${isSortable ? 'cursor-pointer hover:text-gray-700 select-none' : ''}`}
                  onClick={isSortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {isSortable && sortConfig.key === col.key && (
                      sortConfig.direction === 'asc'
                        ? <ArrowUp size={12} />
                        : <ArrowDown size={12} />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedStories.map(story => (
            <tr
              key={story.id}
              className={rowClassName ? rowClassName(story) : 'border-b border-gray-50 hover:bg-gray-50'}
            >
              {effectiveColumns.map(col => (
                <td
                  key={col.key}
                  className={`${px} ${py} ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${col.key === 'summary' ? 'max-w-xs' : ''}`}
                >
                  {renderCellContent(col, story)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Re-export utilities for consumers that need them (e.g., group stats)
export { getStatusPriority, isDone, getStatusColor };
```

**Step 2: Verify the file was created correctly**

Run: `ls -la client/src/components/StoryTable.jsx`
Expected: File exists

**Step 3: Commit**

```bash
git add client/src/components/StoryTable.jsx
git commit -m "feat: add unified StoryTable component with configurable columns"
```

---

### Task 2: Migrate SprintListView to use StoryTable

**Files:**
- Modify: `client/src/components/SprintListView.jsx`

The SprintListView keeps its grouping shell (project group headers, collapsible sections, workload stats) but replaces the inline `<table>` with `<StoryTable>`.

**Step 1: Update SprintListView**

Replace imports at top — remove `ArrowUp, ArrowDown, BookOpen, Bug` from lucide imports, add StoryTable import:

```jsx
import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Pencil } from 'lucide-react';
import StandupHistoryPopover from './StandupHistoryPopover';
import StoryTable, { getStatusPriority, isDone } from './StoryTable';
```

Remove local functions/constants that are now in StoryTable:
- Delete the local `STATUS_PRIORITY` object (lines 5-15)
- Delete the local `getStatusPriority` function (lines 17-20)
- Delete the local `isDone` function (lines 22-26)
- Delete the local `COLUMNS` constant (lines 28-37)
- Delete the local `IssueTypeIcon` function (lines 358-364)
- Delete the local `StatusBadge` function (lines 310-324)

Keep: `computeGroupStats`, `workloadStats`, `AssigneeCell`, `StaleStatusCell`, grouping/collapse/filter logic.

Remove the sort logic from SprintListView since StoryTable handles it:
- Delete `sortConfig` state (line 41)
- Delete `handleSort` function (lines 118-123)
- Simplify `sortedGroups` — just pass groups through without sorting (StoryTable sorts internally)

Replace the table body (lines 196-301) inside each group with:

```jsx
{!collapsed && (
  <StoryTable
    stories={group.stories}
    columns={[
      { key: 'key', label: 'Key', align: 'left' },
      { key: 'summary', label: 'Summary', align: 'left' },
      { key: 'status', label: 'Status', align: 'left' },
      { key: 'assignee', label: 'Assignee', align: 'left' },
      { key: 'story_points', label: 'Points', align: 'right' },
      { key: 'release_date', label: 'Release', align: 'left' },
      { key: 'carry_over_count', label: 'Carry-overs', align: 'right' },
      { key: 'actions', label: 'Actions', align: 'center', sortable: false },
    ]}
    defaultSort={{ key: 'status', direction: 'asc' }}
    onEdit={onEditStory}
    onDelete={null}
    jiraBaseUrl={jiraBaseUrl}
    renderCell={{
      status: (story) => (
        <StaleStatusCell
          story={story}
          staleMap={staleMap}
          standupHistoryMap={standupHistoryMap}
          historyPopover={historyPopover}
          onShowHistory={onShowHistory}
          onCloseHistory={onCloseHistory}
        />
      ),
      assignee: (story) => (
        <AssigneeCell
          name={story.assignee}
          assigneeId={story.assignee_id}
          workloadStats={workloadStats}
          onOpenStandup={onOpenStandup}
        />
      ),
    }}
  />
)}
```

Note: The SprintListView's custom `StaleStatusCell` and `AssigneeCell` are passed via `renderCell` overrides, keeping all existing functionality (stale indicators, workload dots, standup links).

**Step 2: Verify dev server runs without errors**

Run: `cd /Users/elmadah/Projects/manager-os && npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add client/src/components/SprintListView.jsx
git commit -m "refactor: migrate SprintListView to use unified StoryTable"
```

---

### Task 3: Migrate ProjectDetailPage feature stories to use StoryTable

**Files:**
- Modify: `client/src/pages/ProjectDetailPage.jsx`

**Step 1: Update ProjectDetailPage**

Add import at top of file:
```jsx
import StoryTable from '../components/StoryTable';
```

Remove `STORY_STATUS_STYLES` constant (lines 62-67) — no longer needed.

In `FeatureRow` component (around line 577), the function signature already receives `onEditStory` and `onDeleteStory`. Replace the inline stories table (lines 660-723) with:

```jsx
<StoryTable
  stories={stories}
  columns={[
    { key: 'key', label: 'Key', align: 'left' },
    { key: 'summary', label: 'Summary', align: 'left' },
    { key: 'sprint', label: 'Sprint', align: 'left' },
    { key: 'status', label: 'Status', align: 'left' },
    { key: 'assignee', label: 'Assignee', align: 'left' },
    { key: 'story_points', label: 'Points', align: 'right' },
    { key: 'release_date', label: 'Release', align: 'left' },
    { key: 'carry_over_count', label: 'Carry-overs', align: 'right' },
    { key: 'actions', label: 'Actions', align: 'center', sortable: false },
  ]}
  defaultSort={{ key: 'status', direction: 'asc' }}
  onEdit={onEditStory}
  onDelete={onDeleteStory}
  compact
  renderCell={{
    assignee: (story) => (
      <span className="text-gray-600 text-xs">{story.assignee_name || '—'}</span>
    ),
  }}
/>
```

Note: `compact` mode is used here since this is a nested table inside expanded feature rows. The `assignee` field uses `assignee_name` instead of `assignee` in this context, handled via `renderCell`.

This also adds: issue type icons (missing before), Jira links (need `jiraBaseUrl` — see note below), and sorting (missing before).

**Important:** The ProjectDetailPage currently has no `jiraBaseUrl`. Pass `null` for now — the Jira link simply won't render. The component gracefully handles this. If the user wants Jira links here later, they can fetch `jiraBaseUrl` the same way SprintsPage does.

**Step 2: Verify build**

Run: `cd /Users/elmadah/Projects/manager-os && npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add client/src/pages/ProjectDetailPage.jsx
git commit -m "refactor: migrate ProjectDetailPage stories to unified StoryTable"
```

---

### Task 4: Migrate TeamMemberPage active work to use StoryTable

**Files:**
- Modify: `client/src/pages/TeamMemberPage.jsx`

**Step 1: Update TeamMemberPage**

Add import:
```jsx
import StoryTable from '../components/StoryTable';
```

Remove from lucide imports: `ChevronUp`, `ChevronDown`, `RefreshCw` (no longer needed for the table).

Remove `STORY_STATUS_STYLES` constant (lines 10-15).

In `ActiveWorkTab` component (line 273):
- Remove local sort state: `sortCol`, `sortDir` (lines 275-276)
- Remove local `handleSort` function (lines 299-306)
- Remove local `SortIcon` component (lines 308-313)
- Remove local `columns` constant (lines 315-324)
- Simplify `filteredStories` to only do status filtering (remove sort logic from lines 283-296)

Replace the table JSX (lines 389-443) with:

```jsx
<div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
  <StoryTable
    stories={filteredStories}
    columns={[
      { key: 'key', label: 'Key', align: 'left' },
      { key: 'summary', label: 'Summary', align: 'left' },
      { key: 'feature_name', label: 'Feature', align: 'left' },
      { key: 'project_name', label: 'Project', align: 'left' },
      { key: 'sprint', label: 'Sprint', align: 'left' },
      { key: 'status', label: 'Status', align: 'left' },
      { key: 'story_points', label: 'Points', align: 'right' },
      { key: 'carry_over_count', label: 'Carry-overs', align: 'right' },
      { key: 'actions', label: 'Actions', align: 'center', sortable: false },
    ]}
    defaultSort={{ key: 'status', direction: 'asc' }}
    onEdit={null}
    onDelete={null}
    renderCell={{
      project_name: (story) => (
        story.project_name ? (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${projectColorMap[story.project_name]?.badge || 'bg-gray-100 text-gray-700'}`}>
            {story.project_name}
          </span>
        ) : <span className="text-gray-400">—</span>
      ),
    }}
  />
</div>
```

Note: Team Member active work currently has no edit/delete/jira actions. The actions column won't render since all callbacks are null. Issue type icons and sorting are now added for free. The custom project color badge rendering is preserved via `renderCell`.

**Step 2: Add edit/delete support to TeamMemberPage (new functionality)**

The user wants all three tables to have Edit, Jira, and Delete actions. TeamMemberPage currently has none. This requires:

1. Add state for `editingStory` and `deletingStory` in `TeamMemberPage`
2. Add `jiraBaseUrl` fetch (same pattern as SprintsPage)
3. Import `StoryEditModal` and add the confirm dialog for delete
4. Pass `onEdit`, `onDelete`, `jiraBaseUrl` to StoryTable

In `TeamMemberPage` main component, add state:
```jsx
const [editingStory, setEditingStory] = useState(null);
const [deletingStory, setDeletingStory] = useState(null);
const [jiraBaseUrl, setJiraBaseUrl] = useState('');
```

In the existing `useEffect` that loads data, add jiraBaseUrl fetch:
```jsx
api.get('/settings/jira-base-url').then(r => setJiraBaseUrl(r.base_url || '')).catch(() => {});
```

Add handlers:
```jsx
async function handleUpdateStory(storyId, data) {
  try {
    await api.put(`/stories/${storyId}`, data);
    toast.success('Story updated');
    setEditingStory(null);
    // Reload member data
    loadMember();
  } catch {
    toast.error('Failed to update story');
  }
}

async function handleDeleteStory() {
  if (!deletingStory) return;
  try {
    await api.del(`/stories/${deletingStory.id}`);
    toast.success('Story deleted');
    setDeletingStory(null);
    loadMember();
  } catch {
    toast.error('Failed to delete story');
  }
}
```

Pass to `ActiveWorkTab`:
```jsx
<ActiveWorkTab
  stories={activeWork}
  stats={stats}
  velocity={velocity}
  projectColorMap={projectColorMap}
  jiraBaseUrl={jiraBaseUrl}
  onEdit={setEditingStory}
  onDelete={setDeletingStory}
/>
```

Add modals at end of render (before closing `</div>`):
```jsx
{editingStory && (
  <StoryEditModal
    story={editingStory}
    onSave={(data) => handleUpdateStory(editingStory.id, data)}
    onClose={() => setEditingStory(null)}
  />
)}
{deletingStory && (
  <ConfirmDialog
    title="Delete Story"
    message={`Delete "${deletingStory.summary}"? This cannot be undone.`}
    confirmLabel="Delete"
    onConfirm={handleDeleteStory}
    onCancel={() => setDeletingStory(null)}
  />
)}
```

Update `ActiveWorkTab` signature to accept and pass these:
```jsx
function ActiveWorkTab({ stories, stats, velocity, projectColorMap, jiraBaseUrl, onEdit, onDelete }) {
```

And update the StoryTable call to use them:
```jsx
onEdit={onEdit}
onDelete={onDelete}
jiraBaseUrl={jiraBaseUrl}
```

Note: `ConfirmDialog` already exists in ProjectDetailPage. Either extract it to a shared component or duplicate the simple 15-line component. Recommend extracting to `client/src/components/ConfirmDialog.jsx` since it's now used in two places.

**Step 3: Verify build**

Run: `cd /Users/elmadah/Projects/manager-os && npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add client/src/pages/TeamMemberPage.jsx
git commit -m "refactor: migrate TeamMemberPage to unified StoryTable with edit/delete/jira actions"
```

---

### Task 5: Extract ConfirmDialog to shared component

**Files:**
- Create: `client/src/components/ConfirmDialog.jsx`
- Modify: `client/src/pages/ProjectDetailPage.jsx` (remove local ConfirmDialog, import shared)
- Modify: `client/src/pages/TeamMemberPage.jsx` (import shared ConfirmDialog)

**Step 1: Create shared ConfirmDialog**

```jsx
export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Update imports in both pages**

In `ProjectDetailPage.jsx`: Remove local `ConfirmDialog` function (lines 734-757), add import:
```jsx
import ConfirmDialog from '../components/ConfirmDialog';
```

In `TeamMemberPage.jsx`: Add import:
```jsx
import ConfirmDialog from '../components/ConfirmDialog';
```

**Step 3: Verify build**

Run: `cd /Users/elmadah/Projects/manager-os && npm run build 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add client/src/components/ConfirmDialog.jsx client/src/pages/ProjectDetailPage.jsx client/src/pages/TeamMemberPage.jsx
git commit -m "refactor: extract ConfirmDialog to shared component"
```

---

### Task 6: Verify jira-base-url API endpoint exists

**Files:**
- Check: `server/routes/` for settings or jira-related route

**Step 1: Verify the endpoint**

Run: `grep -r "jira-base-url\|jira_base_url\|jiraBaseUrl" server/routes/`

If the endpoint doesn't exist, check how SprintsPage fetches it and ensure the same endpoint is available. The TeamMemberPage fetch should match exactly.

**Step 2: Manual testing**

1. Start dev server: `npm run dev`
2. Navigate to Sprints page → verify "By Project" view still works with issue type icons, sorting, edit/jira actions
3. Navigate to a Project → expand a feature → verify stories now show issue type icons, sorting, and edit/delete/jira actions
4. Navigate to a Team Member → Active Work tab → verify stories now show issue type icons, sorting, project badges, and edit/delete/jira actions
5. Verify column sorting works on all three tables
6. Verify edit modal opens correctly from all three locations
7. Verify delete confirmation works from Project Detail and Team Member pages
8. Verify Jira external link works from Sprint and Team Member pages

**Step 3: Final commit if any fixes needed**
