import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, X, RefreshCw, Lock } from 'lucide-react';
import api from '../lib/api';

const STORY_STATUS_STYLES = {
  'To Do': 'bg-gray-100 text-gray-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  'In Review': 'bg-purple-100 text-purple-700',
  'Done': 'bg-green-100 text-green-700',
};

const TABS = [
  { key: 'active', label: 'Active Work' },
  { key: 'notes', label: '1:1 Notes' },
  { key: 'performance', label: 'Performance' },
  { key: 'general_notes', label: 'Notes' },
];

// Assign consistent colors per project
const PROJECT_COLORS = [
  'border-l-blue-500',
  'border-l-green-500',
  'border-l-purple-500',
  'border-l-orange-500',
  'border-l-pink-500',
  'border-l-teal-500',
  'border-l-red-500',
  'border-l-yellow-500',
];

const PROJECT_BG_COLORS = [
  'bg-blue-50 text-blue-700',
  'bg-green-50 text-green-700',
  'bg-purple-50 text-purple-700',
  'bg-orange-50 text-orange-700',
  'bg-pink-50 text-pink-700',
  'bg-teal-50 text-teal-700',
  'bg-red-50 text-red-700',
  'bg-yellow-50 text-yellow-700',
];

export default function TeamMemberPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [member, setMember] = useState(null);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');

  // Modals
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function loadData() {
    try {
      const [memberData, storiesData] = await Promise.all([
        api.get(`/team/${id}`),
        api.get(`/team/${id}/stories`),
      ]);
      setMember(memberData);
      setStories(storiesData);
    } catch (err) {
      console.error('Failed to load member:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [id]);

  async function handleDelete() {
    try {
      await api.del(`/team/${id}`);
      navigate('/team');
    } catch (err) {
      console.error('Failed to delete member:', err);
    }
  }

  function getInitials(name) {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="text-center py-20">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Team member not found</h2>
        <button onClick={() => navigate('/team')} className="text-blue-600 hover:underline">
          Back to Team
        </button>
      </div>
    );
  }

  // Build project color map
  const projectNames = [...new Set(stories.map((s) => s.project_name || 'Unassigned'))];
  const projectColorMap = {};
  projectNames.forEach((name, i) => {
    projectColorMap[name] = {
      border: PROJECT_COLORS[i % PROJECT_COLORS.length],
      badge: PROJECT_BG_COLORS[i % PROJECT_BG_COLORS.length],
    };
  });

  // Active stories = not Done
  const activeStories = stories.filter((s) => s.status !== 'Done');
  const totalActivePoints = activeStories.reduce((sum, s) => sum + (s.story_points || 0), 0);
  const carryingOver = activeStories.filter((s) => s.carry_over_count > 0).length;

  // Group active stories by project
  const groupedByProject = {};
  for (const story of activeStories) {
    const proj = story.project_name || 'Unassigned';
    if (!groupedByProject[proj]) groupedByProject[proj] = [];
    groupedByProject[proj].push(story);
  }

  return (
    <div>
      {/* Back link */}
      <button
        onClick={() => navigate('/team')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={16} />
        Back to Team
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-2xl font-bold">
            {getInitials(member.name)}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{member.name}</h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              {member.role && <span>{member.role}</span>}
              {member.role && member.email && <span className="text-gray-300">|</span>}
              {member.email && <span>{member.email}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Pencil size={14} />
            Edit
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-8">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'active' && (
        <ActiveWorkTab
          activeStories={activeStories}
          groupedByProject={groupedByProject}
          projectColorMap={projectColorMap}
          totalActivePoints={totalActivePoints}
          carryingOver={carryingOver}
        />
      )}

      {activeTab === 'notes' && <PlaceholderTab label="1:1 Notes" />}
      {activeTab === 'performance' && <PlaceholderTab label="Performance" />}
      {activeTab === 'general_notes' && <PlaceholderTab label="Notes" />}

      {/* Edit Modal */}
      {showEdit && (
        <EditMemberModal
          member={member}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            loadData();
          }}
        />
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Team Member</h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete "{member.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Delete Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveWorkTab({ activeStories, groupedByProject, projectColorMap, totalActivePoints, carryingOver }) {
  if (activeStories.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
        <p className="text-gray-500">No active stories assigned.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{activeStories.length}</p>
          <p className="text-sm text-gray-500">Active stories</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{totalActivePoints}</p>
          <p className="text-sm text-gray-500">Points in progress</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{carryingOver}</p>
          <p className="text-sm text-gray-500">Stories carrying over</p>
        </div>
      </div>

      {/* Stories Table grouped by project */}
      {Object.entries(groupedByProject).map(([projectName, projectStories]) => (
        <div key={projectName} className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${projectColorMap[projectName]?.badge || 'bg-gray-100 text-gray-700'}`}>
              {projectName}
            </span>
            <span className="text-xs text-gray-400">{projectStories.length} stories</span>
          </div>

          <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden border-l-4 ${projectColorMap[projectName]?.border || 'border-l-gray-300'}`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Key</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Summary</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Feature</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Sprint</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Points</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Carry-overs</th>
                </tr>
              </thead>
              <tbody>
                {projectStories.map((story) => (
                  <tr key={story.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-gray-600">{story.key}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{story.summary}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{story.feature_name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{story.sprint || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STORY_STATUS_STYLES[story.status] || 'bg-gray-100 text-gray-700'}`}>
                        {story.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{story.story_points ?? '—'}</td>
                    <td className="px-4 py-3">
                      {story.carry_over_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                          <RefreshCw size={10} />
                          {story.carry_over_count}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function PlaceholderTab({ label }) {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
      <Lock size={40} className="mx-auto text-gray-300 mb-3" />
      <h3 className="text-lg font-semibold text-gray-700 mb-1">{label}</h3>
      <p className="text-gray-400">Coming in Phase 3</p>
    </div>
  );
}

function EditMemberModal({ member, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: member.name || '',
    role: member.role || '',
    email: member.email || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.put(`/team/${member.id}`, form);
      onSaved();
    } catch (err) {
      setError(err.data?.error || 'Failed to update team member');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Edit Team Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <input
              name="role"
              value={form.role}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              name="email"
              type="email"
              value={form.email}
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
