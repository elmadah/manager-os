# UI Improvements Batch — Design

**Date:** 2026-03-24

---

## 1. Sprints Page Changes

### Teams Dropdown Update
- Remove the "All Teams" option from the dropdown
- Default `selectedTeamId` to the first team returned from the API on load

### Default to "By Project" View
- Change `viewMode` initial state from `'status'` to `'project'`
- Status/project toggle buttons remain unchanged

### Team Member Avatar Filter
- New row of circular avatar badges below the sprint selector
- Each badge shows member initials with colored background (using member's `color` field)
- **Multi-select toggle:** clicking an avatar toggles its selected state (highlighted ring when active)
- Stories filtered client-side to show only selected members' stories
- When no avatars are selected, all stories show (no filter)
- Avatars populated from `GET /team` endpoint
- Small "Clear" link appears when any filter is active

---

## 2. Project Description with Tiptap

### Project View Page (`ProjectDetailPage.jsx`)
- New card inserted **above** the existing Features card
- Title: "Project Description" with an edit (pencil) icon button
- **View mode (default):** Renders description HTML with prose styling. If empty, shows muted placeholder: "No description yet — click edit to add one"
- **Edit mode:** Replaces rendered HTML with TiptapEditor component, plus Save and Cancel buttons
- Save sends `PUT /api/projects/:id` with updated description HTML
- Cancel discards changes and returns to view mode

### CreateProjectModal
- Keep existing textarea as-is — rich editing happens on the detail page

---

## 3. Dashboard Sprint Pulse Layout

- Change SprintPulse cards from single-column to 2-column grid (`grid grid-cols-1 md:grid-cols-2 gap-4`)
- Each team's sprint pulse card takes one grid cell
- Responsive: collapses to 1 column on small screens

---

## 4. Tiptap Editor Extensions

### Task List
- Add `@tiptap/extension-task-list` and `@tiptap/extension-task-item` extensions
- Interactive checkboxes in the editor
- Toolbar button and `/Task List` slash command
- CSS styling for checked items

### Mention (Team)
- Add `@tiptap/extension-mention` extension
- `@` trigger shows suggestion dropdown populated from `GET /team` endpoint
- Inserts a styled pill tag (blue background) with member name — visual only, no notifications
- Keyboard navigation and name filtering in suggestion list
- Available everywhere tiptap is used (notes, project description)

### Table (Basic)
- Add `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-header`, `@tiptap/extension-table-cell`
- Toolbar button to insert default 3x3 table
- `/Table` slash command
- Options for: add row above/below, add column before/after, delete row/column, delete table
- Basic border styling with CSS
