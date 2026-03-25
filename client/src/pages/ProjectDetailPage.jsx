import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight, Pencil, Trash2,
  X, BarChart3, Layers, BookOpen, Target, RefreshCw, TrendingUp,
  CheckSquare, Square, Calendar, AlertCircle, ListTodo, GripVertical,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import api from '../lib/api';
import { useToast } from '../components/ToastProvider';
import CreateProjectModal from '../components/CreateProjectModal';
import NotesPanel from '../components/NotesPanel';
import StoryEditModal from '../components/StoryEditModal';
import StoryTable from '../components/StoryTable';
import ConfirmDialog from '../components/ConfirmDialog';
import TiptapEditor from '../components/TiptapEditor';

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
  const [editingStory, setEditingStory] = useState(null);
  const [deletingStory, setDeletingStory] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');

  // Inline editing
  const [editingField, setEditingField] = useState(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');

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
    api.get('/team').then(setTeamMembers).catch(() => {});
    api.get('/settings/jira').then(data => {
      if (data.base_url) setJiraBaseUrl(data.base_url.replace(/\/+$/, ''));
    }).catch(() => {});
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

  async function handleUpdateStory(storyId, data) {
    try {
      const updated = await api.put(`/stories/${storyId}`, data);
      // Refresh stories for the feature
      const featureId = updated.feature_id;
      const stories = await api.get(`/features/${featureId}/stories`);
      setFeatureStories(prev => ({ ...prev, [featureId]: stories }));
      setEditingStory(null);
      toast.success('Story updated');
      loadProject();
    } catch {
      toast.error('Failed to update story');
    }
  }

  async function handleDeleteStory(story) {
    try {
      await api.del(`/stories/${story.id}`);
      setFeatureStories(prev => ({
        ...prev,
        [story.feature_id]: (prev[story.feature_id] || []).filter(s => s.id !== story.id),
      }));
      setDeletingStory(null);
      toast.success('Story deleted');
      loadProject();
    } catch {
      toast.error('Failed to delete story');
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

      {/* Project Description */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">Project Description</h2>
        {!editingDescription && (
          <button
            onClick={() => { setDescriptionDraft(project.description || ''); setEditingDescription(true); }}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Edit description"
          >
            <Pencil size={16} />
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        {editingDescription ? (
          <div>
            <TiptapEditor
              content={descriptionDraft}
              onChange={setDescriptionDraft}
              placeholder="Write your project description..."
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={async () => {
                  try {
                    await api.put(`/projects/${id}`, { description: descriptionDraft });
                    setProject(prev => ({ ...prev, description: descriptionDraft }));
                    setEditingDescription(false);
                    toast.success('Description saved');
                  } catch {
                    toast.error('Failed to save description');
                  }
                }}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => setEditingDescription(false)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          project.description ? (
            <div
              className="prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: project.description }}
            />
          ) : (
            <p className="text-sm text-gray-400 italic">No description yet — click edit to add one</p>
          )
        )}
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
                    onEditStory={setEditingStory}
                    onDeleteStory={setDeletingStory}
                    jiraBaseUrl={jiraBaseUrl}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Todos Section */}
      <div className="mt-8">
        <ProjectTodos projectId={id} toast={toast} />
      </div>

      {/* Notes Section */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Notes</h2>
        <NotesPanel projectId={id} />
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

      {/* Edit Story Modal */}
      {editingStory && (
        <StoryEditModal
          story={editingStory}
          teamMembers={teamMembers}
          onClose={() => setEditingStory(null)}
          onSave={handleUpdateStory}
        />
      )}

      {/* Delete Story Confirmation */}
      {deletingStory && (
        <ConfirmDialog
          title="Delete Story"
          message={`Are you sure you want to delete "${deletingStory.key} — ${deletingStory.summary}"? This action cannot be undone.`}
          confirmLabel="Delete Story"
          onConfirm={() => handleDeleteStory(deletingStory)}
          onCancel={() => setDeletingStory(null)}
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

function FeatureRow({ feature, isExpanded, progress, stories, isLoadingStories, onToggle, onEdit, onDelete, onEditStory, onDeleteStory, jiraBaseUrl }) {
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
                  <StoryTable
                    stories={stories}
                    columns={[
                      { key: 'key', label: 'Key', align: 'left' },
                      { key: 'summary', label: 'Summary', align: 'left' },
                      { key: 'sprint', label: 'Sprint', align: 'left' },
                      { key: 'status', label: 'Status', align: 'left' },
                      { key: 'assignee', label: 'Assignee', align: 'left' },
                      { key: 'story_points', label: 'Points', align: 'right' },
                      { key: 'release_date', label: 'Release', align: 'left' },
                      { key: 'carry_over_count', label: 'Carry-overs', align: 'right' },
                      { key: 'actions', label: 'Actions', align: 'center', sortable: false },
                    ]}
                    defaultSort={{ key: 'status', direction: 'asc' }}
                    onEdit={onEditStory}
                    onDelete={onDeleteStory}
                    jiraBaseUrl={jiraBaseUrl}
                    compact
                    renderCell={{
                      assignee: (story) => (
                        <span className="text-gray-600 text-xs">{story.assignee_name || '—'}</span>
                      ),
                    }}
                  />
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
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


const TODO_PRIORITY_STYLES = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-500',
};

const TODO_DUE_COLORS = {
  overdue: 'text-red-600',
  today: 'text-yellow-600',
  future: 'text-gray-500',
  none: 'text-gray-400',
};

function todoDueDateStatus(dateStr) {
  if (!dateStr) return 'none';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + 'T00:00:00');
  if (due < today) return 'overdue';
  if (due.getTime() === today.getTime()) return 'today';
  return 'future';
}

function formatTodoDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ProjectTodos({ projectId, toast }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inlineTitle, setInlineTitle] = useState('');
  const [inlinePriority, setInlinePriority] = useState('medium');
  const [inlineDueDate, setInlineDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inlineInputRef = useRef(null);

  async function loadTodos() {
    try {
      const data = await api.get(`/todos?project_id=${encodeURIComponent(projectId)}`);
      setTodos(data);
    } catch (err) {
      console.error('Failed to load project todos:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTodos();
  }, [projectId]);

  async function toggleTodo(todo) {
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, is_complete: t.is_complete ? 0 : 1 } : t))
    );
    try {
      await api.put(`/todos/${todo.id}/toggle`);
    } catch {
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, is_complete: todo.is_complete } : t))
      );
    }
  }

  async function deleteTodo(id) {
    try {
      await api.del(`/todos/${id}`);
      setTodos((prev) => prev.filter((t) => t.id !== id));
      toast.success('Todo deleted');
    } catch {
      toast.error('Failed to delete todo');
    }
  }

  async function handleInlineAdd(e) {
    e.preventDefault();
    const trimmed = inlineTitle.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      await api.post('/todos', {
        title: trimmed,
        priority: inlinePriority,
        due_date: inlineDueDate || null,
        project_id: Number(projectId),
      });
      setInlineTitle('');
      setInlinePriority('medium');
      setInlineDueDate('');
      loadTodos();
      // Re-focus input for rapid entry
      setTimeout(() => inlineInputRef.current?.focus(), 50);
    } catch {
      toast.error('Failed to add todo');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDragEnd(result) {
    if (!result.destination) return;
    const srcIdx = result.source.index;
    const destIdx = result.destination.index;
    if (srcIdx === destIdx) return;

    const reordered = Array.from(todos);
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(destIdx, 0, moved);
    setTodos(reordered);

    try {
      await api.put('/todos/reorder', { orderedIds: reordered.map((t) => t.id) });
    } catch {
      loadTodos();
    }
  }

  const activeTodos = todos.filter((t) => !t.is_complete);
  const completedTodos = todos.filter((t) => t.is_complete);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">
          To-Dos
          {todos.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">
              {activeTodos.length} active{completedTodos.length > 0 ? `, ${completedTodos.length} done` : ''}
            </span>
          )}
        </h2>
      </div>

      {/* Inline Add Form — always visible */}
      <form onSubmit={handleInlineAdd} className="flex items-center gap-2 mb-4">
        <Plus size={16} className="text-gray-400 shrink-0" />
        <input
          ref={inlineInputRef}
          value={inlineTitle}
          onChange={(e) => setInlineTitle(e.target.value)}
          placeholder="Add a to-do…"
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50 focus:bg-white transition-colors"
        />
        <select
          value={inlinePriority}
          onChange={(e) => setInlinePriority(e.target.value)}
          className="px-2 py-2 text-xs border border-gray-200 rounded-lg outline-none bg-gray-50"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          type="date"
          value={inlineDueDate}
          onChange={(e) => setInlineDueDate(e.target.value)}
          className="px-2 py-2 text-xs border border-gray-200 rounded-lg outline-none bg-gray-50"
        />
        <button
          type="submit"
          disabled={submitting || !inlineTitle.trim()}
          className="px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
        >
          {submitting ? 'Adding…' : 'Add'}
        </button>
      </form>

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading todos…</div>
      ) : todos.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <ListTodo size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No to-dos for this project yet.</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="project-todos">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                {activeTodos.map((todo, index) => (
                  <Draggable key={todo.id} draggableId={`pt-${todo.id}`} index={index}>
                    {(provided, snapshot) => (
                      <div ref={provided.innerRef} {...provided.draggableProps}>
                        <ProjectTodoItem
                          todo={todo}
                          onToggle={() => toggleTodo(todo)}
                          onDelete={() => deleteTodo(todo.id)}
                          dragHandleProps={provided.dragHandleProps}
                          isDragging={snapshot.isDragging}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                {completedTodos.length > 0 && (
                  <>
                    {activeTodos.length > 0 && <div className="border-t border-gray-100 my-2" />}
                    {completedTodos.map((todo) => (
                      <ProjectTodoItem
                        key={todo.id}
                        todo={todo}
                        onToggle={() => toggleTodo(todo)}
                        onDelete={() => deleteTodo(todo.id)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}

function ProjectTodoItem({ todo, onToggle, onDelete, dragHandleProps, isDragging }) {
  const dueStatus = todoDueDateStatus(todo.due_date);
  const isOverdue = !todo.is_complete && dueStatus === 'overdue';

  return (
    <div className={`group flex items-start gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2.5 hover:shadow-sm transition-all ${
      isOverdue ? 'border-l-4 border-l-red-500' : ''
    } ${todo.is_complete ? 'opacity-60' : ''} ${isDragging ? 'shadow-lg rotate-1' : ''}`}>
      {dragHandleProps && (
        <div
          {...dragHandleProps}
          className="mt-0.5 shrink-0 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </div>
      )}
      <button onClick={onToggle} className="mt-0.5 shrink-0 text-gray-400 hover:text-blue-600 transition-colors">
        {todo.is_complete ? <CheckSquare size={18} className="text-green-500" /> : <Square size={18} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${todo.is_complete ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {todo.title}
          </span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${TODO_PRIORITY_STYLES[todo.priority]}`}>
            {todo.priority}
          </span>
        </div>
        {todo.due_date && (
          <span className={`flex items-center gap-1 text-xs mt-0.5 ${todo.is_complete ? 'text-gray-400' : TODO_DUE_COLORS[dueStatus]}`}>
            <Calendar size={10} />
            {formatTodoDate(todo.due_date)}
            {isOverdue && <AlertCircle size={10} />}
          </span>
        )}
      </div>
      <button
        onClick={onDelete}
        className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
