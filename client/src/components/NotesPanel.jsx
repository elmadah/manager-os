import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, Search, Eye, EyeOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import api from '../lib/api';

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

export default function NotesPanel({ projectId, featureId, teamMemberId, showSearch = true }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Lookup data for dropdowns
  const [projects, setProjects] = useState([]);
  const [features, setFeatures] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  // Debounce search
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
      if (projectId) params.set('project_id', projectId);
      if (featureId) params.set('feature_id', featureId);
      if (teamMemberId) params.set('team_member_id', teamMemberId);
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

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    loadNotes();
  }, [categoryFilter, debouncedSearch, projectId, featureId, teamMemberId]);

  async function handleDelete(id) {
    try {
      await api.del(`/notes/${id}`);
      setDeleteConfirm(null);
      loadNotes();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  }

  function handleEdit(note) {
    setEditingNote(note);
    setShowEditor(true);
  }

  function handleNew() {
    setEditingNote(null);
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

  // Load features when a project is selected in the editor
  async function loadFeaturesForProject(pid) {
    if (!pid) {
      setFeatures([]);
      return;
    }
    try {
      const data = await api.get(`/projects/${pid}/features`);
      setFeatures(data);
    } catch (err) {
      console.error('Failed to load features:', err);
      setFeatures([]);
    }
  }

  return (
    <div>
      {/* Search bar */}
      {showSearch && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      )}

      {/* Category filter tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategoryFilter(cat.key)}
            className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
              categoryFilter === cat.key
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Add Note button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-500">
          {loading ? 'Loading...' : `${notes.length} note${notes.length !== 1 ? 's' : ''}`}
        </h3>
        {!showEditor && (
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} />
            Add Note
          </button>
        )}
      </div>

      {/* Inline Editor */}
      {showEditor && (
        <NoteEditor
          note={editingNote}
          projectId={projectId}
          featureId={featureId}
          teamMemberId={teamMemberId}
          projects={projects}
          features={features}
          teamMembers={teamMembers}
          onLoadFeatures={loadFeaturesForProject}
          onSave={handleSaved}
          onCancel={handleCancel}
        />
      )}

      {/* Notes List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading notes...</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">No notes yet.</p>
          <p className="text-sm text-gray-400 mt-1">Click "Add Note" to create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={() => handleEdit(note)}
              onDelete={() => setDeleteConfirm(note.id)}
            />
          ))}
        </div>
      )}

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

function NoteCard({ note, onEdit, onDelete }) {
  const dateStr = new Date(note.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {/* Header row */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_STYLES[note.category] || CATEGORY_STYLES.general}`}>
            {CATEGORY_LABELS[note.category] || note.category}
          </span>
          {note.project_name && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
              {note.project_name}
            </span>
          )}
          {note.feature_name && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
              {note.feature_name}
            </span>
          )}
          {note.team_member_name && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-600">
              {note.team_member_name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="prose prose-sm max-w-none text-gray-700">
        <ReactMarkdown>{note.content}</ReactMarkdown>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400">{dateStr}</span>
      </div>
    </div>
  );
}

function NoteEditor({ note, projectId, featureId, teamMemberId, projects, features, teamMembers, onLoadFeatures, onSave, onCancel }) {
  const isEdit = !!note;
  const [form, setForm] = useState({
    content: note?.content || '',
    category: note?.category || 'general',
    project_id: note?.project_id || projectId || '',
    feature_id: note?.feature_id || featureId || '',
    team_member_id: note?.team_member_id || teamMemberId || '',
  });
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [localFeatures, setLocalFeatures] = useState(features);

  // Load features when project changes
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
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-900">{isEdit ? 'Edit Note' : 'New Note'}</h4>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Category */}
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

        {/* Content with preview toggle */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">Content *</label>
            <button
              type="button"
              onClick={() => setPreview(!preview)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {preview ? <EyeOff size={12} /> : <Eye size={12} />}
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div className="min-h-[120px] p-3 border border-gray-300 rounded-lg prose prose-sm max-w-none text-gray-700 bg-gray-50">
              <ReactMarkdown>{form.content || '*Nothing to preview*'}</ReactMarkdown>
            </div>
          ) : (
            <textarea
              name="content"
              value={form.content}
              onChange={handleChange}
              rows={5}
              placeholder="Write your note... Markdown supported"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono resize-y"
            />
          )}
        </div>

        {/* Link dropdowns — only show when not pre-set by props */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {!projectId && (
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
          )}

          {!featureId && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Feature</label>
              <select
                name="feature_id"
                value={form.feature_id}
                onChange={handleChange}
                disabled={!form.project_id && !projectId}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50"
              >
                <option value="">None</option>
                {localFeatures.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          {!teamMemberId && (
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
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Note'}
          </button>
        </div>
      </form>
    </div>
  );
}
