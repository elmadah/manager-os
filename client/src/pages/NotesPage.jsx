import { useState, useEffect, useRef, useCallback } from 'react';
import { StickyNote, Plus, Search, Pencil, Trash2, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import TiptapEditor from '../components/TiptapEditor';
import ReactMarkdown from 'react-markdown';
import api from '../lib/api';
import useAutosave from '../hooks/useAutosave';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'general', label: 'General', color: 'bg-gray-100 text-gray-700' },
  { key: 'one_on_one', label: '1:1', color: 'bg-purple-100 text-purple-700' },
  { key: 'performance', label: 'Performance', color: 'bg-blue-100 text-blue-700' },
  { key: 'update', label: 'Update', color: 'bg-green-100 text-green-700' },
  { key: 'blocker', label: 'Blocker', color: 'bg-red-100 text-red-700' },
  { key: 'retro', label: 'Retro', color: 'bg-yellow-100 text-yellow-700' },
];

const CATEGORY_STYLES = {
  general: 'bg-gray-100 text-gray-700',
  one_on_one: 'bg-purple-100 text-purple-700',
  performance: 'bg-blue-100 text-blue-700',
  update: 'bg-green-100 text-green-700',
  blocker: 'bg-red-100 text-red-700',
  retro: 'bg-yellow-100 text-yellow-700',
};

const CATEGORY_LABELS = {
  general: 'General',
  one_on_one: '1:1',
  performance: 'Performance',
  update: 'Update',
  blocker: 'Blocker',
  retro: 'Retro',
};

export default function NotesPage() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedNote, setSelectedNote] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [projects, setProjects] = useState([]);
  const [features, setFeatures] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  const searchTimer = useRef(null);
  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }, []);

  async function loadNotes() {
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const qs = params.toString();
      const data = await api.get(`/notes${qs ? `?${qs}` : ''}`);
      setNotes(data);
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadLookups() {
    try {
      const [p, t] = await Promise.all([
        api.get('/projects'),
        api.get('/team'),
      ]);
      setProjects(p);
      setTeamMembers(t);
    } catch (err) {
      console.error('Failed to load lookups:', err);
    }
  }

  useEffect(() => { loadLookups(); }, []);
  useEffect(() => { loadNotes(); }, [categoryFilter, debouncedSearch]);

  // Keep selectedNote in sync with notes list
  useEffect(() => {
    if (selectedNote) {
      const updated = notes.find((n) => n.id === selectedNote.id);
      if (updated) setSelectedNote(updated);
    }
  }, [notes]);

  async function handleDelete(id) {
    try {
      await api.del(`/notes/${id}`);
      setDeleteConfirm(null);
      if (selectedNote?.id === id) {
        setSelectedNote(null);
        setShowEditor(false);
      }
      loadNotes();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  }

  function handleEdit(note) {
    setEditingNote(note);
    setSelectedNote(note);
    setShowEditor(true);
  }

  function handleNew() {
    setEditingNote(null);
    setSelectedNote(null);
    setShowEditor(true);
  }

  function handleSaved() {
    setShowEditor(false);
    setEditingNote(null);
    loadNotes();
  }

  function handleCancel() {
    setShowEditor(false);
    setEditingNote(null);
  }

  function handleSelectNote(note) {
    setSelectedNote(note);
    setShowEditor(false);
    setEditingNote(null);
  }

  function extractTitleAndPreview(content) {
    if (!content) return { title: '', preview: '' };
    // Try to extract first heading (h1 or h2) from HTML
    const headingMatch = content.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
    const stripHtmlAndMd = (str) => str.replace(/<[^>]*>/g, '').replace(/[#*_~`>\-\[\]()!]/g, '').trim();
    if (headingMatch) {
      const title = stripHtmlAndMd(headingMatch[1]);
      const rest = stripHtmlAndMd(content.replace(headingMatch[0], ''));
      return {
        title: title.length > 80 ? title.slice(0, 80) + '...' : title,
        preview: rest.length > 80 ? rest.slice(0, 80) + '...' : rest,
      };
    }
    // Fallback: first 50 chars as title, next 80 as preview
    const plain = stripHtmlAndMd(content);
    const title = plain.slice(0, 50);
    const preview = plain.slice(50, 130);
    return {
      title: title + (plain.length > 50 ? '...' : ''),
      preview: preview ? (preview + (plain.length > 130 ? '...' : '')) : '',
    };
  }

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="inline-flex p-2 rounded-lg bg-yellow-50 text-yellow-600">
          <StickyNote size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notes</h1>
          <p className="text-sm text-gray-500">All notes across projects, features, and team members</p>
        </div>
      </div>

      {/* Search + filters bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title={sidebarCollapsed ? 'Show notes list' : 'Hide notes list'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <div className="relative w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategoryFilter(cat.key)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                categoryFilter === cat.key
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {loading ? 'Loading...' : `${notes.length} note${notes.length !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={handleNew}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Plus size={12} />
            New Note
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 230px)' }}>
        {/* Sidebar */}
        {!sidebarCollapsed && (
        <div className="w-80 shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Notes list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
            ) : notes.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No notes found</div>
            ) : (
              notes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => handleSelectNote(note)}
                  className={`w-full text-left px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    selectedNote?.id === note.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CATEGORY_STYLES[note.category] || CATEGORY_STYLES.general}`}>
                      {CATEGORY_LABELS[note.category] || note.category}
                    </span>
                    {note.project_name && (
                      <span className="text-[10px] text-blue-600 truncate">{note.project_name}</span>
                    )}
                  </div>
                  {(() => {
                    const { title, preview } = extractTitleAndPreview(note.content);
                    return (
                      <>
                        <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{title}</p>
                        {preview && <p className="text-xs text-gray-500 truncate leading-snug">{preview}</p>}
                      </>
                    );
                  })()}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-400">{formatDate(note.updated_at)}</span>
                    {note.team_member_name && (
                      <span className="text-[10px] text-teal-600">{note.team_member_name}</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
          {showEditor ? (
            <div className="flex flex-col flex-1 min-h-0">
              <NoteEditor
                note={editingNote}
                projects={projects}
                features={features}
                teamMembers={teamMembers}
                onSave={handleSaved}
                onCancel={handleCancel}
                onNoteCreated={(created) => setEditingNote(created)}
                onNoteSaved={() => loadNotes()}
              />
            </div>
          ) : selectedNote ? (
            <div className="p-6 overflow-y-auto flex-1">
              {/* Note header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${CATEGORY_STYLES[selectedNote.category] || CATEGORY_STYLES.general}`}>
                    {CATEGORY_LABELS[selectedNote.category] || selectedNote.category}
                  </span>
                  {selectedNote.project_name && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">
                      {selectedNote.project_name}
                    </span>
                  )}
                  {selectedNote.feature_name && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-600">
                      {selectedNote.feature_name}
                    </span>
                  )}
                  {selectedNote.team_member_name && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-50 text-teal-600">
                      {selectedNote.team_member_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <button
                    onClick={() => handleEdit(selectedNote)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(selectedNote.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Date */}
              <div className="mb-4 pb-4 border-b border-gray-100">
                <span className="text-xs text-gray-400">
                  {new Date(selectedNote.updated_at).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {/* Content */}
              <div className="prose prose-sm max-w-none text-gray-700">
                {selectedNote.content?.startsWith('<') ? (
                  <div dangerouslySetInnerHTML={{ __html: selectedNote.content }} />
                ) : (
                  <ReactMarkdown>{selectedNote.content}</ReactMarkdown>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <StickyNote size={48} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a note to view it</p>
                <p className="text-xs mt-1">or click "New" to create one</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Note</h3>
            <p className="text-sm text-gray-600 mb-6">Are you sure? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteEditor({ note, projects, features, teamMembers, onSave, onCancel, onNoteCreated, onNoteSaved }) {
  const isEdit = !!note;
  const [form, setForm] = useState({
    content: note?.content || '',
    category: note?.category || 'general',
    project_id: note?.project_id || '',
    feature_id: note?.feature_id || '',
    team_member_id: note?.team_member_id || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [localFeatures, setLocalFeatures] = useState(features || []);

  const { saveStatus, createdNote, flushSave } = useAutosave({
    editingNote: note,
    content: form.content,
    contextDefaults: {
      category: form.category,
      projectId: form.project_id || null,
      featureId: form.feature_id || null,
      teamMemberId: form.team_member_id || null,
    },
  });

  // When autosave creates a new note, notify parent
  useEffect(() => {
    if (createdNote && onNoteCreated) {
      onNoteCreated(createdNote);
      if (onNoteSaved) onNoteSaved();
    }
  }, [createdNote]);

  // When autosave completes a save for existing notes, refresh list
  useEffect(() => {
    if (saveStatus === 'saved' && onNoteSaved && note) {
      onNoteSaved();
    }
  }, [saveStatus]);

  useEffect(() => {
    if (form.project_id) {
      api.get(`/projects/${form.project_id}/features`)
        .then(setLocalFeatures)
        .catch(() => setLocalFeatures([]));
    } else {
      setLocalFeatures([]);
    }
  }, [form.project_id]);

  function handleChange(e) {
    const { name, value } = e.target;
    if (name === 'project_id') {
      setForm({ ...form, project_id: value, feature_id: '' });
    } else {
      setForm({ ...form, [name]: value });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.content.trim()) {
      setError('Content is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        content: form.content,
        category: form.category,
        project_id: form.project_id || null,
        feature_id: form.feature_id || null,
        team_member_id: form.team_member_id || null,
      };
      if (isEdit) {
        await api.put(`/notes/${note.id}`, payload);
      } else {
        await api.post('/notes', payload);
      }
      onSave();
    } catch (err) {
      setError(err.data?.error || 'Failed to save note');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
      {error && (
        <div className="mx-6 mt-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <TiptapEditor
        content={form.content}
        onChange={(html) => setForm((f) => ({ ...f, content: html }))}
        placeholder="Write your note..."
      />

      <div className="px-6 pb-4 pt-2 border-t border-gray-100 space-y-3 shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {CATEGORIES.filter((c) => c.key !== 'all').map((cat) => (
                <option key={cat.key} value={cat.key}>{cat.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
            <select
              name="project_id"
              value={form.project_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Feature</label>
            <select
              name="feature_id"
              value={form.feature_id}
              onChange={handleChange}
              disabled={!form.project_id}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50"
            >
              <option value="">None</option>
              {localFeatures.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Team Member</label>
            <select
              name="team_member_id"
              value={form.team_member_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">None</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <span
            className={`text-xs text-gray-400 mr-auto transition-opacity duration-300 ${
              saveStatus === 'idle' ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''}
          </span>
          <button
            type="button"
            onClick={() => { flushSave(); onCancel(); }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Note'}
          </button>
        </div>
      </div>
    </form>
  );
}
