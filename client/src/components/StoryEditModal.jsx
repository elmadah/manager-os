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
