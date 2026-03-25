# Notes Autosave

## Goal

Add autosave to the notes editor so content is saved automatically as the user types, preventing data loss and reducing friction. The existing Save button remains for explicit saves (content + metadata).

## Design Decisions

- **Trigger:** Debounced — saves 1.5s after the user stops typing
- **Scope:** Both new and existing notes autosave content
- **New notes:** Auto-created with "general" category and context defaults (e.g., projectId from parent)
- **Metadata:** Only content autosaves; category/project/feature/team member still save via explicit Save button
- **Indicator:** Small "Saving..." / "Saved" text near editor, fades after 2s
- **UX flow:** Existing view/edit split and Save button unchanged; autosave runs in the background as a safety net

## Implementation

### Step 1: Create `useAutosave` hook

**File:** `client/src/hooks/useAutosave.js`

Create a custom hook with the following interface:

```js
useAutosave({ editingNote, content, contextDefaults })
// Returns: { saveStatus, createdNote, flushSave }
```

**Inputs:**
- `editingNote` — current note object (null if new)
- `content` — current editor HTML string
- `contextDefaults` — `{ projectId, featureId, teamMemberId }` from parent props

**Returns:**
- `saveStatus` — `'idle'` | `'saving'` | `'saved'`
- `createdNote` — the note object created by autosave (so parent can track it)
- `flushSave()` — immediately saves pending changes (call on editor close/unmount)

**Internal logic:**
1. `useEffect` watches `content` — on change, clear pending timeout, set new 1.5s timer
2. Timer fires → compare content with `lastSavedContent` ref, skip if identical
3. If no note exists yet → `POST /api/notes` with content + contextDefaults → store returned note in state
4. If note exists → `PUT /api/notes/:id` with content only
5. Update `saveStatus`: `'saving'` → `'saved'` → `'idle'` after 2s
6. Use `isSaving` ref to prevent overlapping requests
7. Cleanup on unmount calls `flushSave()`

### Step 2: Wire autosave into NoteEditor in `NotesPanel.jsx`

- Import and call `useAutosave` inside NoteEditor, passing `editingNote`, current form content, and context defaults from props
- When `createdNote` changes (new note was auto-created), update `editingNote` state so subsequent saves are PUTs
- On editor close/unmount, call `flushSave()` before resetting state
- Keep the existing `handleSubmit` for explicit saves (saves all fields including metadata)

### Step 3: Wire autosave into NoteEditor in `NotesPage.jsx`

- Same integration as Step 2, adapted for NotesPage's state structure

### Step 4: Add save status indicator

- Add a `<span>` inside NoteEditor (near top-right of editor area, not in the Tiptap toolbar)
- Show "Saving..." when `saveStatus === 'saving'`
- Show "Saved" when `saveStatus === 'saved'`
- Hidden when `saveStatus === 'idle'`
- Use CSS `opacity` transition for fade-out effect

### Step 5: Refresh notes list after autosave

- After a successful autosave (especially for new notes), refresh the notes list in the sidebar so the new/updated note appears
- Avoid full reload on every autosave — only reload list when a new note is created, or update the specific note's preview in-place for edits

## No Server Changes Required

The existing `POST /api/notes` and `PUT /api/notes/:id` endpoints already support the needed operations.

## Edge Cases

- **Empty content:** Don't autosave if content is empty or whitespace-only (prevents creating blank notes)
- **Rapid typing:** Debounce ensures only one save per pause, `isSaving` ref prevents overlapping requests
- **Navigate away:** `flushSave()` on unmount handles this
- **Network failure:** Set `saveStatus` to `'idle'` on error (silent failure — the Save button remains as fallback)
