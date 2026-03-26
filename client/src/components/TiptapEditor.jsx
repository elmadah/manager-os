import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { useCallback, useRef, useState, useEffect } from 'react';
import MentionList from './MentionList';
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Quote, Minus, ImagePlus, Undo, Redo,
  ListChecks, Table as TableIcon, Highlighter, Link as LinkIcon, ChevronDown, Ban,
} from 'lucide-react';
import { createSlashCommands } from './SlashCommands';
import { DragHandle } from './DragHandle';
import './TiptapEditor.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const HEADING_OPTIONS = [
  { level: null, label: 'Normal text' },
  { level: 1, label: 'Heading 1' },
  { level: 2, label: 'Heading 2' },
  { level: 3, label: 'Heading 3' },
  { level: 4, label: 'Heading 4' },
];

const HIGHLIGHT_COLORS = [
  { color: '#fef08a', label: 'Yellow' },
  { color: '#bbf7d0', label: 'Green' },
  { color: '#bfdbfe', label: 'Blue' },
  { color: '#fecaca', label: 'Red' },
  { color: '#e9d5ff', label: 'Purple' },
  { color: '#fed7aa', label: 'Orange' },
];

export default function TiptapEditor({ content, onChange, placeholder = 'Write your note...', teamMembers: teamMembersProp }) {
  const fileInputRef = useRef(null);
  const [fetchedMembers, setFetchedMembers] = useState([]);
  const [showHeadingDropdown, setShowHeadingDropdown] = useState(false);
  const [showHighlightDropdown, setShowHighlightDropdown] = useState(false);
  const headingRef = useRef(null);
  const highlightRef = useRef(null);
  const teamMembers = teamMembersProp || fetchedMembers;
  const teamMembersRef = useRef(teamMembers);
  teamMembersRef.current = teamMembers;

  useEffect(() => {
    if (!teamMembersProp) {
      fetch(`${API_BASE}/team`).then(r => r.json()).then(setFetchedMembers).catch(() => {});
    }
  }, [teamMembersProp]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e) {
      if (headingRef.current && !headingRef.current.contains(e.target)) {
        setShowHeadingDropdown(false);
      }
      if (highlightRef.current && !highlightRef.current.contains(e.target)) {
        setShowHighlightDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const triggerImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: 'Type / for commands...' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
      }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        renderLabel: ({ node }) => `@${node.attrs.label || node.attrs.id}`,
        suggestion: {
          items: ({ query }) => {
            return teamMembersRef.current
              .filter(m => m.name.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 10);
          },
          render: () => {
            let component;
            let popup;

            return {
              onStart: (props) => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });
                if (!props.clientRect) return;
                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                });
              },
              onUpdate: (props) => {
                component?.updateProps(props);
                if (props.clientRect) {
                  popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect });
                }
              },
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                  popup?.[0]?.hide();
                  return true;
                }
                return component?.ref?.onKeyDown(props);
              },
              onExit: () => {
                popup?.[0]?.destroy();
                component?.destroy();
              },
            };
          },
        },
      }),
      createSlashCommands(triggerImageUpload),
      DragHandle,
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

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

  function handleSetLink() {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  function getCurrentHeadingLabel() {
    for (const opt of HEADING_OPTIONS) {
      if (opt.level && editor.isActive('heading', { level: opt.level })) return opt.label;
    }
    return 'Normal text';
  }

  function applyHeading(level) {
    if (level) {
      editor.chain().focus().toggleHeading({ level }).run();
    } else {
      editor.chain().focus().setParagraph().run();
    }
    setShowHeadingDropdown(false);
  }

  function applyHighlight(color) {
    if (color) {
      editor.chain().focus().toggleHighlight({ color }).run();
    } else {
      editor.chain().focus().unsetHighlight().run();
    }
    setShowHighlightDropdown(false);
  }

  if (!editor) return null;

  return (
    <div className="tiptap-editor flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Floating Bubble Menu — appears on text selection */}
      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 150 }}
        className="bubble-menu"
      >
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
          title="Code"
        >
          <Code size={14} />
        </ToolbarBtn>
        <div className="w-px h-5 bg-gray-500/30 mx-0.5" />
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
          active={editor.isActive('highlight')}
          title="Highlight"
        >
          <Highlighter size={14} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={handleSetLink}
          active={editor.isActive('link')}
          title="Link"
        >
          <LinkIcon size={14} />
        </ToolbarBtn>
      </BubbleMenu>

      {/* Static Toolbar */}
      <div className="shrink-0 flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 flex-wrap">
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

        {/* Heading dropdown */}
        <div className="relative" ref={headingRef}>
          <button
            type="button"
            onClick={() => setShowHeadingDropdown(!showHeadingDropdown)}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
          >
            {getCurrentHeadingLabel()}
            <ChevronDown size={12} />
          </button>
          {showHeadingDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[140px]">
              {HEADING_OPTIONS.map((opt) => (
                <button
                  key={opt.level ?? 'normal'}
                  type="button"
                  onClick={() => applyHeading(opt.level)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 transition-colors ${
                    (opt.level ? editor.isActive('heading', { level: opt.level }) : !editor.isActive('heading'))
                      ? 'text-blue-600 font-medium'
                      : 'text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Divider />

        {/* Highlight color dropdown */}
        <div className="relative" ref={highlightRef}>
          <button
            type="button"
            onClick={() => setShowHighlightDropdown(!showHighlightDropdown)}
            title="Highlight"
            className={`flex items-center gap-1 p-1.5 rounded transition-colors ${
              editor.isActive('highlight')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
            }`}
          >
            <Highlighter size={14} />
            <ChevronDown size={10} />
          </button>
          {showHighlightDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 flex items-center gap-1.5">
              {HIGHLIGHT_COLORS.map((h) => (
                <button
                  key={h.color}
                  type="button"
                  onClick={() => applyHighlight(h.color)}
                  title={h.label}
                  className="w-6 h-6 rounded-full border border-gray-200 hover:scale-110 transition-transform"
                  style={{ background: h.color }}
                />
              ))}
              <button
                type="button"
                onClick={() => applyHighlight(null)}
                title="Remove highlight"
                className="w-6 h-6 rounded-full border border-gray-200 hover:scale-110 transition-transform flex items-center justify-center text-gray-400"
              >
                <Ban size={12} />
              </button>
            </div>
          )}
        </div>

        <ToolbarBtn
          onClick={handleSetLink}
          active={editor.isActive('link')}
          title="Link"
        >
          <LinkIcon size={14} />
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

        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive('taskList')}
          title="Task list"
        >
          <ListChecks size={14} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Insert table"
        >
          <TableIcon size={14} />
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

      {/* Table Controls — shown when cursor is inside a table */}
      {editor.isActive('table') && (
        <div className="table-toolbar flex-wrap border-b border-gray-200 px-2 py-1.5 bg-gray-50">
          <button onClick={() => editor.chain().focus().addRowBefore().run()}>Row above</button>
          <button onClick={() => editor.chain().focus().addRowAfter().run()}>Row below</button>
          <div className="separator" />
          <button onClick={() => editor.chain().focus().addColumnBefore().run()}>Col before</button>
          <button onClick={() => editor.chain().focus().addColumnAfter().run()}>Col after</button>
          <div className="separator" />
          <button className="destructive" onClick={() => editor.chain().focus().deleteRow().run()}>Delete row</button>
          <button className="destructive" onClick={() => editor.chain().focus().deleteColumn().run()}>Delete col</button>
          <button className="destructive" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</button>
        </div>
      )}

      {/* Editor */}
      <div className="prose prose-sm max-w-none relative flex-1 overflow-y-auto">
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
