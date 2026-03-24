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
import Mention from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { useCallback, useRef, useState, useEffect } from 'react';
import MentionList from './MentionList';
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Heading1, Heading2, Quote, Minus, ImagePlus, Undo, Redo,
  ListChecks, Table as TableIcon,
} from 'lucide-react';
import { createSlashCommands } from './SlashCommands';
import { DragHandle } from './DragHandle';
import './TiptapEditor.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function TiptapEditor({ content, onChange, placeholder = 'Write your note...', teamMembers: teamMembersProp }) {
  const fileInputRef = useRef(null);
  const [fetchedMembers, setFetchedMembers] = useState([]);
  const teamMembers = teamMembersProp || fetchedMembers;
  const teamMembersRef = useRef(teamMembers);
  teamMembersRef.current = teamMembers;

  useEffect(() => {
    if (!teamMembersProp) {
      fetch(`${API_BASE}/team`).then(r => r.json()).then(setFetchedMembers).catch(() => {});
    }
  }, [teamMembersProp]);

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

  if (!editor) return null;

  return (
    <div className="tiptap-editor border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
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
      </BubbleMenu>

      {/* Static Toolbar */}
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
      <div className="prose prose-sm max-w-none relative">
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
