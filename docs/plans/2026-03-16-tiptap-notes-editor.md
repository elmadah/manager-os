# Tiptap Rich Text Notes Editor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the plain markdown textarea in notes with a Notion-like Tiptap rich text editor that supports inline image uploads.

**Architecture:** Create a shared `TiptapEditor` component used by both `NotesPanel.jsx` and `NotesPage.jsx`. Images are uploaded to a local `data/uploads/` directory via a new multer-based endpoint, then inserted inline via Tiptap's Image extension. Note content transitions from markdown to HTML storage. Old markdown notes render via react-markdown fallback.

**Tech Stack:** Tiptap (core + starter-kit + image + placeholder), multer (already installed), Express static serving, Tailwind prose for styling.

---

### Task 1: Install Tiptap packages

**Files:**
- Modify: `client/package.json`

**Step 1: Install Tiptap dependencies**

Run:
```bash
cd client && npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-placeholder @tiptap/pm
```

**Step 2: Verify install**

Run: `cd client && npm ls @tiptap/react`
Expected: Shows installed version

**Step 3: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "feat: add tiptap editor dependencies"
```

---

### Task 2: Create image upload endpoint

**Files:**
- Modify: `server/index.js`
- Create: `server/routes/uploads.js`

**Step 1: Create `server/routes/uploads.js`**

```javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../data/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /^image\/(jpeg|jpg|png|gif|webp|svg\+xml)$/;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// POST /api/uploads/image
router.post('/image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }
  res.json({ url: `/api/uploads/${req.file.filename}` });
});

module.exports = router;
```

**Step 2: Register route and serve uploads in `server/index.js`**

Add after existing route imports:

```javascript
const uploadsRouter = require('./routes/uploads');
```

Add after existing `app.use` routes:

```javascript
app.use('/api/uploads', express.static(path.join(__dirname, '../data/uploads')));
app.use('/api/uploads', uploadsRouter);
```

**Important:** The static middleware must come **before** the router so that `GET /api/uploads/:filename` serves the file, while `POST /api/uploads/image` hits the router.

**Step 3: Test manually**

Run:
```bash
curl -X POST http://localhost:3001/api/uploads/image \
  -F "image=@client/public/vite.svg" 2>/dev/null | head -1
```
Expected: `{"url":"/api/uploads/<uuid>.svg"}`

**Step 4: Commit**

```bash
git add server/routes/uploads.js server/index.js
git commit -m "feat: add image upload endpoint with local disk storage"
```

---

### Task 3: Create shared TiptapEditor component

**Files:**
- Create: `client/src/components/TiptapEditor.jsx`
- Create: `client/src/components/TiptapEditor.css`

**Step 1: Create `client/src/components/TiptapEditor.css`**

Tiptap editor styling — keeps the editor looking clean with Tailwind prose and image handling:

```css
.tiptap-editor .ProseMirror {
  outline: none;
  min-height: 120px;
  padding: 0.75rem;
}

.tiptap-editor .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: #9ca3af;
  pointer-events: none;
  height: 0;
}

.tiptap-editor .ProseMirror img {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
  margin: 0.5rem 0;
  cursor: default;
}

.tiptap-editor .ProseMirror img.ProseMirror-selectednode {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}
```

**Step 2: Create `client/src/components/TiptapEditor.jsx`**

```jsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useCallback, useRef } from 'react';
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Heading1, Heading2, Quote, Minus, ImagePlus, Undo, Redo,
} from 'lucide-react';
import './TiptapEditor.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function TiptapEditor({ content, onChange, placeholder = 'Write your note...' }) {
  const fileInputRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  const uploadImage = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`${API_BASE}/uploads/image`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Upload failed');
    const { url } = await res.json();
    return url;
  }, []);

  const handleImageUpload = useCallback(async () => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    try {
      const url = await uploadImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      console.error('Image upload failed:', err);
    }
    e.target.value = '';
  }, [editor, uploadImage]);

  // Handle paste/drop images
  if (editor && !editor._imageHandlersAttached) {
    editor._imageHandlersAttached = true;
    editor.view.dom.addEventListener('paste', async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            try {
              const url = await uploadImage(file);
              editor.chain().focus().setImage({ src: url }).run();
            } catch (err) {
              console.error('Paste image failed:', err);
            }
          }
          break;
        }
      }
    });
  }

  if (!editor) return null;

  return (
    <div className="tiptap-editor border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 flex-wrap">
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <Bold size={14} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <Italic size={14} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough size={14} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive('code')}
          title="Inline code"
        >
          <Code size={14} />
        </ToolbarBtn>

        <Divider />

        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 size={14} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 size={14} />
        </ToolbarBtn>

        <Divider />

        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet list"
        >
          <List size={14} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Ordered list"
        >
          <ListOrdered size={14} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="Blockquote"
        >
          <Quote size={14} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Divider"
        >
          <Minus size={14} />
        </ToolbarBtn>

        <Divider />

        <ToolbarBtn onClick={handleImageUpload} title="Upload image">
          <ImagePlus size={14} />
        </ToolbarBtn>

        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarBtn
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <Undo size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <Redo size={14} />
          </ToolbarBtn>
        </div>
      </div>

      {/* Editor */}
      <div className="prose prose-sm max-w-none">
        <EditorContent editor={editor} />
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}

function ToolbarBtn({ children, onClick, active, disabled, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
      } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-1" />;
}
```

**Step 3: Commit**

```bash
git add client/src/components/TiptapEditor.jsx client/src/components/TiptapEditor.css
git commit -m "feat: create shared TiptapEditor component with image upload"
```

---

### Task 4: Replace NoteEditor in NotesPanel.jsx

**Files:**
- Modify: `client/src/components/NotesPanel.jsx`

**Step 1: Update the NoteEditor function inside NotesPanel.jsx**

Replace the textarea + preview toggle with TiptapEditor:

1. Add import at top:
```jsx
import TiptapEditor from './TiptapEditor';
```

2. Remove `react-markdown` import (line 3) — it's still needed for `NoteCard` rendering of old markdown content, so **keep it**.

3. In the `NoteEditor` function:
   - Remove the `preview` state and `Eye/EyeOff` import usage in the editor section
   - Replace the entire "Content with preview toggle" `<div>` block (lines 412-438) with:

```jsx
<div>
  <label className="text-xs font-medium text-gray-600 mb-1 block">Content *</label>
  <TiptapEditor
    content={form.content}
    onChange={(html) => setForm((f) => ({ ...f, content: html }))}
    placeholder="Write your note..."
  />
</div>
```

4. Remove `Eye, EyeOff` from lucide-react import if no longer used elsewhere in the file.

**Step 2: Update NoteCard to render HTML content**

The `NoteCard` component currently renders with `<ReactMarkdown>`. Since new notes will be HTML and old notes markdown, add a detection heuristic. Replace the content rendering (line 308-309):

```jsx
{note.content?.startsWith('<') ? (
  <div dangerouslySetInnerHTML={{ __html: note.content }} />
) : (
  <ReactMarkdown>{note.content}</ReactMarkdown>
)}
```

**Step 3: Verify the app builds**

Run: `cd client && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add client/src/components/NotesPanel.jsx
git commit -m "feat: replace NotesPanel editor textarea with TiptapEditor"
```

---

### Task 5: Replace NoteEditor in NotesPage.jsx

**Files:**
- Modify: `client/src/pages/NotesPage.jsx`

**Step 1: Update NoteEditor in NotesPage.jsx**

Same pattern as Task 4:

1. Add import:
```jsx
import TiptapEditor from '../components/TiptapEditor';
```

2. In the `NoteEditor` function:
   - Replace the content textarea + preview block (lines 449-475) with:

```jsx
<div>
  <label className="text-xs font-medium text-gray-600 mb-1 block">Content *</label>
  <TiptapEditor
    content={form.content}
    onChange={(html) => setForm((f) => ({ ...f, content: html }))}
    placeholder="Write your note..."
  />
</div>
```

3. Remove `Eye, EyeOff` from lucide-react import (only if unused elsewhere in the file — they are NOT used elsewhere, so remove them).

**Step 2: Update the read-only note view (line 316-317)**

Replace:
```jsx
<ReactMarkdown>{selectedNote.content}</ReactMarkdown>
```

With:
```jsx
{selectedNote.content?.startsWith('<') ? (
  <div dangerouslySetInnerHTML={{ __html: selectedNote.content }} />
) : (
  <ReactMarkdown>{selectedNote.content}</ReactMarkdown>
)}
```

**Step 3: Update `getPreview` function (line 140-143)**

The existing preview strips markdown chars. Update it to also handle HTML:

```jsx
function getPreview(content) {
  if (!content) return '';
  // Strip HTML tags, then strip markdown chars
  const plain = content.replace(/<[^>]*>/g, '').replace(/[#*_~`>\-\[\]()!]/g, '').trim();
  return plain.length > 100 ? plain.slice(0, 100) + '...' : plain;
}
```

**Step 4: Verify the app builds**

Run: `cd client && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add client/src/pages/NotesPage.jsx
git commit -m "feat: replace NotesPage editor textarea with TiptapEditor"
```

---

### Task 6: Manual smoke test

**No code changes — validation only.**

**Step 1:** Start the dev server

Run: `cd server && npm run dev` (in one terminal)
Run: `cd client && npm run dev` (in another terminal)

**Step 2:** Test creating a new note
- Navigate to `/notes`
- Click "New Note"
- Verify Tiptap editor renders with toolbar (bold, italic, headings, image, etc.)
- Type some text, use toolbar formatting
- Click the image upload button, select an image
- Verify image appears inline in the editor
- Save the note
- Verify the note renders with formatting and image in the read-only view

**Step 3:** Test editing an existing markdown note
- If you have old notes, click edit
- Verify old markdown content loads into the editor (may show raw markdown — this is expected since Tiptap doesn't parse markdown)
- Verify saving works

**Step 4:** Test paste image
- Copy an image to clipboard
- Paste into the editor
- Verify the image uploads and appears inline

**Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address smoke test issues with tiptap editor"
```

---

## Summary of files changed

| File | Action |
|------|--------|
| `client/package.json` | Add tiptap deps |
| `client/src/components/TiptapEditor.jsx` | **New** — shared editor component |
| `client/src/components/TiptapEditor.css` | **New** — editor styles |
| `client/src/components/NotesPanel.jsx` | Replace textarea with TiptapEditor |
| `client/src/pages/NotesPage.jsx` | Replace textarea with TiptapEditor |
| `server/routes/uploads.js` | **New** — image upload endpoint |
| `server/index.js` | Register uploads route + static serving |

## Backward compatibility

- Old notes stored as markdown: detected by `content.startsWith('<')` heuristic — if it doesn't start with `<`, render with `ReactMarkdown` as before
- New notes stored as HTML from Tiptap's `getHTML()`
- No database schema changes needed — `content` column is already `TEXT`
