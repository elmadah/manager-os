import { useState, useEffect, useRef } from 'react';
import {
  Plus, CheckSquare, Square, Calendar, Pencil, Trash2, X,
  AlertCircle, ArrowUpDown, ListTodo,
} from 'lucide-react';
import api from '../lib/api';

const PRIORITY_STYLES = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-500',
};

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dueDateStatus(dateStr) {
  if (!dateStr) return 'none';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + 'T00:00:00');
  if (due < today) return 'overdue';
  if (due.getTime() === today.getTime()) return 'today';
  return 'future';
}

const DUE_COLORS = {
  overdue: 'text-red-600',
  today: 'text-yellow-600',
  future: 'text-gray-500',
  none: 'text-gray-400',
};

export default function TodosPage() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('due_date');
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [editingTitleVal, setEditingTitleVal] = useState('');
  const titleInputRef = useRef(null);

  async function loadTodos() {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      const qs = params.toString();
      const data = await api.get(`/todos${qs ? `?${qs}` : ''}`);
      setTodos(sortTodos(data, sortBy));
    } catch (err) {
      console.error('Failed to load todos:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTodos();
  }, [statusFilter, priorityFilter]);

  useEffect(() => {
    setTodos((prev) => sortTodos([...prev], sortBy));
  }, [sortBy]);

  useEffect(() => {
    if (editingTitleId && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitleId]);

  function sortTodos(list, by) {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = [...list];
    sorted.sort((a, b) => {
      // Overdue items always float to top (only for incomplete)
      const aOverdue = !a.is_complete && a.due_date && dueDateStatus(a.due_date) === 'overdue';
      const bOverdue = !b.is_complete && b.due_date && dueDateStatus(b.due_date) === 'overdue';
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      if (by === 'due_date') {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      }
      if (by === 'priority') {
        return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
      }
      if (by === 'created_at') {
        return (b.created_at || '').localeCompare(a.created_at || '');
      }
      return 0;
    });
    return sorted;
  }

  async function toggleTodo(todo) {
    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, is_complete: t.is_complete ? 0 : 1 } : t))
    );
    try {
      await api.put(`/todos/${todo.id}/toggle`);
    } catch {
      // Revert on failure
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, is_complete: todo.is_complete } : t))
      );
    }
  }

  async function deleteTodo(id) {
    try {
      await api.del(`/todos/${id}`);
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Failed to delete todo:', err);
    }
  }

  async function saveInlineTitle(id) {
    const trimmed = editingTitleVal.trim();
    if (!trimmed) {
      setEditingTitleId(null);
      return;
    }
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t)));
    setEditingTitleId(null);
    try {
      await api.put(`/todos/${id}`, { title: trimmed });
    } catch {
      loadTodos();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">My To-Dos</h1>
        <button
          onClick={() => { setEditingTodo(null); setShowAddModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Todo
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Status toggle */}
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {['active', 'completed', 'all'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
                statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Priority filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Sort */}
        <div className="flex items-center gap-1.5 ml-auto">
          <ArrowUpDown size={14} className="text-gray-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="due_date">Due date</option>
            <option value="priority">Priority</option>
            <option value="created_at">Created date</option>
          </select>
        </div>
      </div>

      {/* Todo list */}
      {todos.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <ListTodo size={48} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">No to-dos yet</h2>
          <p className="text-gray-500 mb-6">Create your first to-do to start tracking tasks.</p>
          <button
            onClick={() => { setEditingTodo(null); setShowAddModal(true); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Add your first to-do
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {todos.map((todo) => {
            const dueStatus = dueDateStatus(todo.due_date);
            const isOverdue = !todo.is_complete && dueStatus === 'overdue';

            return (
              <div
                key={todo.id}
                className={`group bg-white rounded-lg border border-gray-200 px-4 py-3 hover:shadow-sm transition-all ${
                  isOverdue ? 'border-l-4 border-l-red-500' : ''
                } ${todo.is_complete ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleTodo(todo)}
                    className="mt-0.5 shrink-0 text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    {todo.is_complete ? (
                      <CheckSquare size={20} className="text-green-500" />
                    ) : (
                      <Square size={20} />
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {editingTitleId === todo.id ? (
                        <input
                          ref={titleInputRef}
                          value={editingTitleVal}
                          onChange={(e) => setEditingTitleVal(e.target.value)}
                          onBlur={() => saveInlineTitle(todo.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveInlineTitle(todo.id);
                            if (e.key === 'Escape') setEditingTitleId(null);
                          }}
                          className="font-semibold text-gray-900 bg-blue-50 border border-blue-300 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-blue-500 flex-1"
                        />
                      ) : (
                        <span
                          onClick={() => {
                            setEditingTitleId(todo.id);
                            setEditingTitleVal(todo.title);
                          }}
                          className={`font-semibold cursor-text ${
                            todo.is_complete ? 'line-through text-gray-400' : 'text-gray-900'
                          }`}
                        >
                          {todo.title}
                        </span>
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${PRIORITY_STYLES[todo.priority] || PRIORITY_STYLES.medium}`}>
                        {todo.priority}
                      </span>
                    </div>

                    {todo.description && (
                      <p className="text-sm text-gray-500 mt-0.5 truncate">{todo.description}</p>
                    )}

                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {todo.due_date && (
                        <span className={`flex items-center gap-1 text-xs ${todo.is_complete ? 'text-gray-400' : DUE_COLORS[dueStatus]}`}>
                          <Calendar size={12} />
                          {formatDate(todo.due_date)}
                          {isOverdue && <AlertCircle size={12} />}
                        </span>
                      )}
                      {todo.project_name && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          {todo.project_name}
                        </span>
                      )}
                      {todo.team_member_name && (
                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                          {todo.team_member_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => { setEditingTodo(todo); setShowAddModal(true); }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteTodo(todo.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <TodoModal
          todo={editingTodo}
          onClose={() => { setShowAddModal(false); setEditingTodo(null); }}
          onSaved={() => {
            setShowAddModal(false);
            setEditingTodo(null);
            loadTodos();
          }}
        />
      )}
    </div>
  );
}

function TodoModal({ todo, onClose, onSaved }) {
  const isEditing = !!todo;
  const [form, setForm] = useState({
    title: todo?.title || '',
    description: todo?.description || '',
    due_date: todo?.due_date || '',
    priority: todo?.priority || 'medium',
    project_id: todo?.project_id || '',
    team_member_id: todo?.team_member_id || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    api.get('/projects').then(setProjects).catch(() => {});
    api.get('/team').then(setMembers).catch(() => {});
  }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        project_id: form.project_id || null,
        team_member_id: form.team_member_id || null,
      };
      if (isEditing) {
        await api.put(`/todos/${todo.id}`, payload);
      } else {
        await api.post('/todos', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.data?.error || `Failed to ${isEditing ? 'update' : 'create'} todo`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">{isEditing ? 'Edit Todo' : 'Add Todo'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="What needs to be done?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              placeholder="Add details…"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
              <input
                name="due_date"
                type="date"
                value={form.due_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
              <div className="flex gap-3">
                {['high', 'medium', 'low'].map((p) => (
                  <label key={p} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="priority"
                      value={p}
                      checked={form.priority === p}
                      onChange={handleChange}
                      className="accent-blue-600"
                    />
                    <span className="text-sm capitalize text-gray-700">{p}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select
                name="project_id"
                value={form.project_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Team member</label>
              <select
                name="team_member_id"
                value={form.team_member_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">None</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
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
              {submitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Todo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
