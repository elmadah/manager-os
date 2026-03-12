import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight, Pencil, Trash2,
  X, BarChart3, Layers, BookOpen, Target, RefreshCw, TrendingUp,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/ToastProvider';
import CreateProjectModal from '../components/CreateProjectModal';
import NotesPanel from '../components/NotesPanel';

const STATUS_STYLES = {
  upcoming: 'bg-gray-100 text-gray-700',
  planning: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  wrapping_up: 'bg-yellow-100 text-yellow-700',
  complete: 'bg-slate-100 text-slate-700',
};

const STATUS_LABELS = {
  upcoming: 'Upcoming',
  planning: 'Planning',
  active: 'Active',
  wrapping_up: 'Wrapping Up',
  complete: 'Complete',
};

const HEALTH_COLORS = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
};

const HEALTH_LABELS = {
  green: 'On Track',
  yellow: 'At Risk',
  red: 'Off Track',
};

const FEATURE_STATUS_STYLES = {
  not_started: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  complete: 'bg-green-100 text-green-700',
};

const FEATURE_STATUS_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  complete: 'Complete',
};

const PRIORITY_STYLES = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
};

const STORY_STATUS_STYLES = {
  'To Do': 'bg-gray-100 text-gray-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  'In Review': 'bg-purple-100 text-purple-700',
  'Done': 'bg-green-100 text-green-700',
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedFeatures, setExpandedFeatures] = useState({});
  const [featureStories, setFeatureStories] = useState({});
  const [loadingStories, setLoadingStories] = useState({});

  // Modals
  const [showEditProject, setShowEditProject] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddFeature, setShowAddFeature] = useState(false);
  const [editingFeature, setEditingFeature] = useState(null);
  const [deletingFeature, setDeletingFeature] = useState(null);

  // Inline editing
  const [editingField, setEditingField] = useState(null);

  async function loadProject() {
    try {
      const data = await api.get(`/projects/${id}`);
      // Enrich features with completed_points from the feature-level query
      const featuresData = await api.get(`/projects/${id}/features`);
      const featureMap = {};
      for (const f of featuresData) {
        featureMap[f.id] = f;
      }
      data.features = data.features.map(f => ({
        ...f,
        completed_points: featureMap[f.id]?.story_stats?.points || f.completed_points || 0,
        carry_overs: featureMap[f.id]?.story_stats?.carry_overs || 0,
      }));
      setProject(data);
    } catch (err) {
      console.error('Failed to load project:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProject();
  }, [id]);

  async function toggleFeature(featureId) {
    const isExpanding = !expandedFeatures[featureId];
    setExpandedFeatures(prev => ({ ...prev, [featureId]: isExpanding }));

    if (isExpanding && !featureStories[featureId]) {
      setLoadingStories(prev => ({ ...prev, [featureId]: true }));
      try {
        const stories = await api.get(`/features/${featureId}/stories`);
        setFeatureStories(prev => ({ ...prev, [featureId]: stories }));
      } catch (err) {
        console.error('Failed to load stories:', err);
      } finally {
        setLoadingStories(prev => ({ ...prev, [featureId]: false }));
      }
    }
  }

  async function handleInlineUpdate(field, value) {
    try {
      await api.put(`/projects/${id}`, { [field]: value });
      setProject(prev => ({ ...prev, [field]: value }));
    } catch (err) {
      console.error('Failed to update:', err);
    }
    setEditingField(null);
  }

  async function handleDeleteProject() {
    try {
      await api.del(`/projects/${id}`);
      toast.success('Project deleted');
      navigate('/projects');
    } catch {
      toast.error('Failed to delete project');
    }
  }

  async function handleDeleteFeature(featureId) {
    try {
      await api.del(`/features/${featureId}`);
      setDeletingFeature(null);
      toast.success('Feature deleted');
      loadProject();
    } catch {
      toast.error('Failed to delete feature');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Project not found</h2>
        <button onClick={() => navigate('/projects')} className="text-blue-600 hover:underline">
          Back to projects
        </button>
      </div>
    );
  }

  const { story_stats: ss, features } = project;
  const totalCarryOvers = features.reduce((sum, f) => sum + (f.carry_overs || 0), 0);
  const progress = ss.total_stories > 0 ? Math.round((ss.completed_stories / ss.total_stories) * 100) : 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft size={16} />
          Back to Projects
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{project.name}</h1>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Editable Status */}
              {editingField === 'status' ? (
                <select
                  autoFocus
                  value={project.status}
                  onChange={(e) => handleInlineUpdate('status', e.target.value)}
                  onBlur={() => setEditingField(null)}
                  className="text-xs font-medium px-2.5 py-1 rounded-full border border-gray-300 outline-none"
                >
                  {Object.entries(STATUS_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              ) : (
                <button
                  onClick={() => setEditingField('status')}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full cursor-pointer hover:ring-2 hover:ring-gray-300 ${STATUS_STYLES[project.status]}`}
                >
                  {STATUS_LABELS[project.status]}
                </button>
              )}

              {/* Editable Health */}
              {editingField === 'health' ? (
                <div className="flex gap-2">
                  {Object.entries(HEALTH_LABELS).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => handleInlineUpdate('health', val)}
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${project.health === val ? 'border-gray-400 bg-gray-50' : 'border-gray-200'}`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${HEALTH_COLORS[val]}`} />
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => setEditingField('health')}
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:ring-2 hover:ring-gray-300 rounded-full px-2 py-1 cursor-pointer"
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${HEALTH_COLORS[project.health]}`} />
                  {HEALTH_LABELS[project.health]}
                </button>
              )}

              <span className="text-gray-300">|</span>

              {/* Editable Start Date */}
              {editingField === 'start_date' ? (
                <input
                  type="date"
                  autoFocus
                  value={project.start_date || ''}
                  onChange={(e) => handleInlineUpdate('start_date', e.target.value || null)}
                  onBlur={() => setEditingField(null)}
                  className="text-xs px-2 py-1 border border-gray-300 rounded outline-none"
                />
              ) : (
                <button
                  onClick={() => setEditingField('start_date')}
                  className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  Start: {project.start_date ? new Date(project.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}
                </button>
              )}

              {/* Editable Target Date */}
              {editingField === 'target_date' ? (
                <input
                  type="date"
                  autoFocus
                  value={project.target_date || ''}
                  onChange={(e) => handleInlineUpdate('target_date', e.target.value || null)}
                  onBlur={() => setEditingField(null)}
                  className="text-xs px-2 py-1 border border-gray-300 rounded outline-none"
                />
              ) : (
                <button
                  onClick={() => setEditingField('target_date')}
                  className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  Target: {project.target_date ? new Date(project.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowEditProject(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Pencil size={14} />
              Edit Project
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
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard icon={<Layers size={18} />} label="Features" value={features.length} color="blue" />
        <StatCard icon={<BookOpen size={18} />} label="Stories" value={`${ss.completed_stories} / ${ss.total_stories}`} color="green" />
        <StatCard icon={<Target size={18} />} label="Points" value={`${ss.completed_points} / ${ss.total_points}`} color="purple" />
        <StatCard icon={<RefreshCw size={18} />} label="Carry-overs" value={totalCarryOvers} color="orange" />
        <StatCard icon={<TrendingUp size={18} />} label="Progress" value={`${progress}%`} color="teal" />
        <StatCard icon={<BarChart3 size={18} />} label="Health" value={HEALTH_LABELS[project.health]} color={project.health === 'green' ? 'green' : project.health === 'yellow' ? 'orange' : 'red'} />
      </div>

      {/* Features Section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">Features</h2>
        <button
          onClick={() => { setEditingFeature(null); setShowAddFeature(true); }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} />
          Add Feature
        </button>
      </div>

      {features.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Layers size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-4">No features yet. Add your first feature to get started.</p>
          <button
            onClick={() => { setEditingFeature(null); setShowAddFeature(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} />
            Add Feature
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="w-8 px-4 py-3" />
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Feature</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Priority</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Stories</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Points</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Carry-overs</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 w-32">Progress</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => {
                const isExpanded = expandedFeatures[feature.id];
                const fProgress = feature.total_stories > 0
                  ? Math.round((feature.completed_stories / feature.total_stories) * 100)
                  : 0;
                const stories = featureStories[feature.id] || [];
                const isLoadingStories = loadingStories[feature.id];

                return (
                  <FeatureRow
                    key={feature.id}
                    feature={feature}
                    isExpanded={isExpanded}
                    progress={fProgress}
                    stories={stories}
                    isLoadingStories={isLoadingStories}
                    onToggle={() => toggleFeature(feature.id)}
                    onEdit={() => { setEditingFeature(feature); setShowAddFeature(true); }}
                    onDelete={() => setDeletingFeature(feature)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes Section */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Notes</h2>
        <NotesPanel projectId={id} showSearch={false} />
      </div>

      {/* Edit Project Modal */}
      <CreateProjectModal
        isOpen={showEditProject}
        onClose={() => setShowEditProject(false)}
        onCreated={loadProject}
        project={project}
      />

      {/* Delete Project Confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Project"
          message={`Are you sure you want to delete "${project.name}"? This will also delete all features and their stories. This action cannot be undone.`}
          confirmLabel="Delete Project"
          onConfirm={handleDeleteProject}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Delete Feature Confirmation */}
      {deletingFeature && (
        <ConfirmDialog
          title="Delete Feature"
          message={`Are you sure you want to delete "${deletingFeature.name}"? This action cannot be undone.`}
          confirmLabel="Delete Feature"
          onConfirm={() => handleDeleteFeature(deletingFeature.id)}
          onCancel={() => setDeletingFeature(null)}
        />
      )}

      {/* Add/Edit Feature Modal */}
      {showAddFeature && (
        <FeatureModal
          projectId={id}
          feature={editingFeature}
          onClose={() => { setShowAddFeature(false); setEditingFeature(null); }}
          onSaved={() => { setShowAddFeature(false); setEditingFeature(null); loadProject(); }}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    teal: 'bg-teal-50 text-teal-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`inline-flex p-2 rounded-lg mb-2 ${colorMap[color]}`}>{icon}</div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function FeatureRow({ feature, isExpanded, progress, stories, isLoadingStories, onToggle, onEdit, onDelete }) {
  return (
    <>
      <tr className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-gray-50' : ''}`}>
        <td className="px-4 py-3">
          <button onClick={onToggle} className="text-gray-400 hover:text-gray-600">
            {isExpanded
              ? <ChevronDown size={16} className="transition-transform" />
              : <ChevronRight size={16} className="transition-transform" />
            }
          </button>
        </td>
        <td className="px-4 py-3">
          <button onClick={onToggle} className="text-sm font-medium text-gray-900 hover:text-blue-600 text-left">
            {feature.name}
          </button>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${FEATURE_STATUS_STYLES[feature.status]}`}>
            {FEATURE_STATUS_LABELS[feature.status]}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${PRIORITY_STYLES[feature.priority]}`}>
            {feature.priority}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">
          {feature.completed_stories} / {feature.total_stories} done
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">
          {feature.completed_points} / {feature.total_points} pts
        </td>
        <td className="px-4 py-3">
          {feature.carry_overs > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
              <RefreshCw size={10} />
              {feature.carry_overs}
            </span>
          ) : (
            <span className="text-xs text-gray-400">0</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 w-8 text-right">{progress}%</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded Stories */}
      {isExpanded && (
        <tr>
          <td colSpan={9} className="p-0">
            <div className="overflow-hidden transition-all">
              <div className="bg-slate-50 px-8 py-4 border-b border-gray-200">
                {isLoadingStories ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Loading stories…</p>
                ) : stories.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No stories for this feature.</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2">Key</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2">Summary</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2">Sprint</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2">Status</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2">Assignee</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2">Points</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2">Release</th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider pb-2">Carry-overs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stories.map((story) => (
                        <tr key={story.id} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 pr-4 text-xs font-mono text-gray-600">{story.key}</td>
                          <td className="py-2 pr-4 text-sm text-gray-900 max-w-xs truncate">{story.summary}</td>
                          <td className="py-2 pr-4 text-xs text-gray-600">{story.sprint || '—'}</td>
                          <td className="py-2 pr-4">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STORY_STATUS_STYLES[story.status] || 'bg-gray-100 text-gray-700'}`}>
                              {story.status}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-xs text-gray-600">{story.assignee_name || '—'}</td>
                          <td className="py-2 pr-4 text-xs text-gray-600">{story.story_points ?? '—'}</td>
                          <td className="py-2 pr-4 text-xs text-gray-600">
                            {story.release_date
                              ? new Date(story.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : '—'}
                          </td>
                          <td className="py-2 pr-4">
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
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function FeatureModal({ projectId, feature, onClose, onSaved }) {
  const isEdit = !!feature;
  const [form, setForm] = useState({
    name: feature?.name || '',
    description: feature?.description || '',
    status: feature?.status || 'not_started',
    priority: feature?.priority || 'medium',
    start_date: feature?.start_date || '',
    target_date: feature?.target_date || '',
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
      if (isEdit) {
        await api.put(`/features/${feature.id}`, form);
      } else {
        await api.post(`/projects/${projectId}/features`, form);
      }
      onSaved();
    } catch (err) {
      setError(err.data?.error || `Failed to ${isEdit ? 'update' : 'create'} feature`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Feature' : 'Add Feature'}</h2>
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
              placeholder="Feature name"
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
              placeholder="What does this feature do?"
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
                {Object.entries(FEATURE_STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                name="priority"
                value={form.priority}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
              <input
                type="date"
                name="target_date"
                value={form.target_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
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
              {submitting ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Feature')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
