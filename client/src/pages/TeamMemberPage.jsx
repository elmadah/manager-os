import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, X, Zap, CheckCircle, Clock, AlertTriangle, TrendingUp, Plus, ChevronRight, MessageSquare, Calendar, Copy, Save, FileText, Shield } from 'lucide-react';
import { ComposedChart, LineChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ReactMarkdown from 'react-markdown';
import api from '../lib/api';
import { useToast } from '../components/ToastProvider';
import NotesPanel from '../components/NotesPanel';
import StoryTable from '../components/StoryTable';
import StoryEditModal from '../components/StoryEditModal';
import ConfirmDialog from '../components/ConfirmDialog';

const TABS = [
  { key: 'active', label: 'Active Work' },
  { key: 'notes', label: '1:1 Notes' },
  { key: 'performance', label: 'Performance' },
  { key: 'general_notes', label: 'Notes' },
];

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

const STATUS_OPTIONS = ['All', 'To Do', 'In Progress', 'In Review', 'Done'];

export default function TeamMemberPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [member, setMember] = useState(null);
  const [stories, setStories] = useState([]);
  const [stats, setStats] = useState(null);
  const [velocity, setVelocity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');

  // Modals
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingStory, setEditingStory] = useState(null);
  const [deletingStory, setDeletingStory] = useState(null);
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');
  const [allMembers, setAllMembers] = useState([]);

  async function loadData() {
    try {
      const [memberData, storiesData, velocityData] = await Promise.all([
        api.get(`/team/${id}`),
        api.get(`/team/${id}/stories`),
        api.get(`/team/${id}/velocity`),
      ]);
      setMember(memberData);
      setStories(storiesData.stories);
      setStats(storiesData.stats);
      setVelocity(velocityData);
    } catch (err) {
      console.error('Failed to load member:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    api.get('/settings/jira').then(data => {
      if (data.base_url) setJiraBaseUrl(data.base_url.replace(/\/+$/, ''));
    }).catch(() => {});
    api.get('/team').then(setAllMembers).catch(() => {});
  }, [id]);

  async function handleDelete() {
    try {
      await api.del(`/team/${id}`);
      toast.success('Team member deleted');
      navigate('/team');
    } catch {
      toast.error('Failed to delete team member');
    }
  }

  async function handleUpdateStory(storyId, data) {
    try {
      await api.put(`/stories/${storyId}`, data);
      toast.success('Story updated');
      setEditingStory(null);
      loadData();
    } catch {
      toast.error('Failed to update story');
    }
  }

  async function handleDeleteStory() {
    if (!deletingStory) return;
    try {
      await api.del(`/stories/${deletingStory.id}`);
      toast.success('Story deleted');
      setDeletingStory(null);
      loadData();
    } catch {
      toast.error('Failed to delete story');
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

  // Build member color map
  const memberColorMap = {};
  allMembers.forEach(m => { memberColorMap[m.name] = m.color || '#9ca3af'; });

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
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: member.color || '#9ca3af' }}
          >
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
          stories={stories}
          stats={stats}
          velocity={velocity}
          projectColorMap={projectColorMap}
          memberColorMap={memberColorMap}
          jiraBaseUrl={jiraBaseUrl}
          onEdit={setEditingStory}
          onDelete={setDeletingStory}
        />
      )}

      {activeTab === 'notes' && <OneOnOneTab memberId={id} />}
      {activeTab === 'performance' && <PerformanceTab memberId={id} memberName={member.name} />}
      {activeTab === 'general_notes' && <NotesPanel teamMemberId={id} />}

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
        <ConfirmDialog
          title="Delete Team Member"
          message={`Are you sure you want to delete "${member.name}"? This action cannot be undone.`}
          confirmLabel="Delete Member"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Story Edit Modal */}
      {editingStory && (
        <StoryEditModal
          story={editingStory}
          onSave={(data) => handleUpdateStory(editingStory.id, data)}
          onClose={() => setEditingStory(null)}
        />
      )}

      {/* Story Delete Confirmation */}
      {deletingStory && (
        <ConfirmDialog
          title="Delete Story"
          message={`Delete "${deletingStory.summary}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteStory}
          onCancel={() => setDeletingStory(null)}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, highlight }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    teal: 'bg-teal-50 text-teal-600',
  };

  return (
    <div className={`bg-white rounded-xl border p-4 ${highlight ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'}`}>
      <div className={`inline-flex p-2 rounded-lg mb-2 ${colorMap[color] || colorMap.blue}`}>
        {icon}
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function ActiveWorkTab({ stories, stats, velocity, projectColorMap, memberColorMap, jiraBaseUrl, onEdit, onDelete }) {
  const [statusFilter, setStatusFilter] = useState('All');

  const filteredStories = useMemo(() => {
    if (statusFilter === 'All') return stories;
    return stories.filter((s) => s.status === statusFilter);
  }, [stories, statusFilter]);

  return (
    <div>
      {/* Summary Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <StatCard
            icon={<Zap size={18} />}
            label="Active stories"
            value={stats.total_active}
            color="blue"
          />
          <StatCard
            icon={<TrendingUp size={18} />}
            label="Points in progress"
            value={stats.total_points_in_progress}
            color="purple"
          />
          <StatCard
            icon={<AlertTriangle size={18} />}
            label="Carrying over"
            value={stats.carry_over_count}
            color="orange"
            highlight={stats.carry_over_count > 0}
          />
          <StatCard
            icon={<CheckCircle size={18} />}
            label="Completed (30d)"
            value={stats.completed_last_30_days}
            color="green"
          />
          <StatCard
            icon={<Clock size={18} />}
            label="Avg sprints to complete"
            value={stats.avg_sprints_to_complete}
            color="teal"
          />
        </div>
      )}

      {/* Status filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-medium text-gray-500">Filter:</span>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => setStatusFilter(opt)}
            className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
              statusFilter === opt
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Stories Table */}
      {filteredStories.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">No stories match the current filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
          <StoryTable
            stories={filteredStories}
            columns={[
              { key: 'key', label: 'Key', align: 'left' },
              { key: 'summary', label: 'Summary', align: 'left' },
              { key: 'feature_name', label: 'Feature', align: 'left' },
              { key: 'project_name', label: 'Project', align: 'left' },
              { key: 'sprint', label: 'Sprint', align: 'left' },
              { key: 'status', label: 'Status', align: 'left' },
              { key: 'story_points', label: 'Points', align: 'right' },
              { key: 'carry_over_count', label: 'Carry-overs', align: 'right' },
              { key: 'actions', label: 'Actions', align: 'center', sortable: false },
            ]}
            defaultSort={{ key: 'status', direction: 'asc' }}
            onEdit={onEdit}
            onDelete={onDelete}
            jiraBaseUrl={jiraBaseUrl}
            memberColorMap={memberColorMap}
            renderCell={{
              project_name: (story) => (
                story.project_name ? (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${projectColorMap[story.project_name]?.badge || 'bg-gray-100 text-gray-700'}`}>
                    {story.project_name}
                  </span>
                ) : <span className="text-gray-400">—</span>
              ),
            }}
          />
        </div>
      )}

      {/* Velocity Chart */}
      <VelocityChart velocity={velocity} />
    </div>
  );
}

function VelocityChart({ velocity }) {
  if (!velocity || velocity.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Velocity</h3>
        <div className="text-center py-12">
          <TrendingUp size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No velocity data available yet.</p>
          <p className="text-sm text-gray-400 mt-1">Velocity will appear once stories are completed across sprints.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Velocity</h3>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={velocity}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="sprint" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="points_completed"
            name="Points Completed"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Bar
            yAxisId="right"
            dataKey="carry_over_count"
            name="Carry-overs"
            fill="#f97316"
            radius={[4, 4, 0, 0]}
            opacity={0.7}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const SENTIMENT_CONFIG = {
  engaged: { label: 'Engaged', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  neutral: { label: 'Neutral', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  frustrated: { label: 'Frustrated', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  needs_support: { label: 'Needs Support', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

function SentimentTimeline({ oneOnOnes }) {
  const recent = oneOnOnes.slice(0, 15).reverse();
  if (recent.length < 2) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Sentiment Timeline</h4>
      <div className="flex items-end gap-1">
        {recent.map((o, i) => {
          const cfg = SENTIMENT_CONFIG[o.sentiment] || SENTIMENT_CONFIG.neutral;
          const dateStr = new Date(o.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <div key={o.id} className="flex flex-col items-center flex-1 min-w-0 group relative">
              <div className={`w-3 h-3 rounded-full ${cfg.dot} cursor-pointer`} />
              {i < recent.length - 1 && (
                <div className="h-px bg-gray-200 w-full mt-1.5" />
              )}
              <span className="text-[10px] text-gray-400 mt-1 truncate w-full text-center">{dateStr}</span>
              <div className="absolute bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {dateStr}: {cfg.label}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-gray-100">
        {Object.entries(SENTIMENT_CONFIG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function OneOnOneTab({ memberId }) {
  const [oneOnOnes, setOneOnOnes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  async function loadOneOnOnes() {
    try {
      const data = await api.get(`/team/${memberId}/one-on-ones`);
      setOneOnOnes(data);
    } catch (err) {
      console.error('Failed to load 1:1s:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOneOnOnes();
  }, [memberId]);

  function toggleExpand(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleDelete(id) {
    try {
      await api.del(`/one-on-ones/${id}`);
      setDeleteConfirm(null);
      loadOneOnOnes();
    } catch (err) {
      console.error('Failed to delete 1:1:', err);
    }
  }

  function handleEdit(entry) {
    setEditing(entry);
    setShowModal(true);
  }

  function handleNew() {
    setEditing(null);
    setShowModal(true);
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-400">Loading 1:1 notes...</div>;
  }

  return (
    <div>
      {/* Header with New button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">1:1 Notes</h3>
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} />
          New 1:1
        </button>
      </div>

      {/* Sentiment Timeline */}
      <SentimentTimeline oneOnOnes={oneOnOnes} />

      {/* 1:1 List */}
      {oneOnOnes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <MessageSquare size={40} className="mx-auto text-gray-300 mb-3" />
          <h3 className="text-lg font-semibold text-gray-700 mb-1">No 1:1 notes yet</h3>
          <p className="text-gray-400">Click "New 1:1" to record your first session.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {oneOnOnes.map((entry) => {
            const isExpanded = expanded[entry.id];
            const cfg = SENTIMENT_CONFIG[entry.sentiment] || SENTIMENT_CONFIG.neutral;
            const dateStr = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
            });
            const preview = entry.talking_points
              ? entry.talking_points.slice(0, 100) + (entry.talking_points.length > 100 ? '...' : '')
              : 'No talking points recorded';

            return (
              <div key={entry.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Card Header */}
                <button
                  onClick={() => toggleExpand(entry.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <ChevronRight
                    size={16}
                    className={`text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{dateStr}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    {!isExpanded && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{preview}</p>
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    {entry.talking_points && (
                      <div className="mt-3">
                        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Talking Points</h5>
                        <div className="prose prose-sm max-w-none text-gray-700">
                          <ReactMarkdown>{entry.talking_points}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {entry.action_items && (
                      <div className="mt-3">
                        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Action Items</h5>
                        <div className="prose prose-sm max-w-none text-gray-700">
                          <ReactMarkdown>{entry.action_items}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => handleEdit(entry)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(entry.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New/Edit Modal */}
      {showModal && (
        <OneOnOneModal
          memberId={memberId}
          entry={editing}
          latestEntry={!editing ? oneOnOnes[0] : null}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowModal(false);
            setEditing(null);
            loadOneOnOnes();
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete 1:1 Note</h3>
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

function getUncheckedItems(actionItems) {
  if (!actionItems) return '';
  const lines = actionItems.split('\n');
  const unchecked = lines.filter((line) => /^\s*-\s*\[\s*\]/.test(line));
  return unchecked.join('\n');
}

function OneOnOneModal({ memberId, entry, latestEntry, onClose, onSaved }) {
  const isEdit = !!entry;
  const today = new Date().toISOString().split('T')[0];

  // Build carry-forward text for new entries
  let carryForward = '';
  if (!isEdit && latestEntry) {
    const unchecked = getUncheckedItems(latestEntry.action_items);
    if (unchecked) {
      const prevDate = new Date(latestEntry.date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      carryForward = `Carried from ${prevDate}:\n${unchecked}`;
    }
  }

  const [form, setForm] = useState({
    date: entry?.date || today,
    talking_points: entry?.talking_points || '',
    action_items: entry?.action_items || carryForward,
    sentiment: entry?.sentiment || 'neutral',
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
        await api.put(`/one-on-ones/${entry.id}`, form);
      } else {
        await api.post(`/team/${memberId}/one-on-ones`, form);
      }
      onSaved();
    } catch (err) {
      setError(err.data?.error || 'Failed to save 1:1');
    } finally {
      setSubmitting(false);
    }
  }

  const sentimentOptions = [
    { value: 'engaged', label: 'Engaged', color: 'text-green-700 bg-green-50 border-green-300' },
    { value: 'neutral', label: 'Neutral', color: 'text-gray-700 bg-gray-50 border-gray-300' },
    { value: 'frustrated', label: 'Frustrated', color: 'text-orange-700 bg-orange-50 border-orange-300' },
    { value: 'needs_support', label: 'Needs Support', color: 'text-red-700 bg-red-50 border-red-300' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit 1:1' : 'New 1:1'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Talking Points */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Talking Points</label>
            <textarea
              name="talking_points"
              value={form.talking_points}
              onChange={handleChange}
              rows={6}
              placeholder="What did you discuss? Markdown supported..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
            />
          </div>

          {/* Action Items */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action Items</label>
            <p className="text-xs text-gray-400 mb-1">Use "- [ ] item" for checkboxes, "- [x] item" for completed</p>
            <textarea
              name="action_items"
              value={form.action_items}
              onChange={handleChange}
              rows={4}
              placeholder={"- [ ] Follow up on project timeline\n- [ ] Share design doc with team"}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
            />
          </div>

          {/* Sentiment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sentiment</label>
            <div className="flex flex-wrap gap-2">
              {sentimentOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm font-medium ${
                    form.sentiment === opt.value
                      ? opt.color + ' ring-2 ring-offset-1 ring-blue-400'
                      : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="sentiment"
                    value={opt.value}
                    checked={form.sentiment === opt.value}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
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
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create 1:1'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const DATE_PRESETS = [
  { label: 'Last Quarter', months: 3 },
  { label: 'Last 6 Months', months: 6 },
  { label: 'Last Year', months: 12 },
];

function getDateRange(months) {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

function CollapsibleSection({ title, icon, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <ChevronRight size={16} className={`text-gray-400 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`} />
        <span className="flex items-center gap-2 flex-1">
          {icon}
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          {count !== undefined && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{count}</span>
          )}
        </span>
      </button>
      {open && <div className="px-5 pb-5 border-t border-gray-100">{children}</div>}
    </div>
  );
}

function PerformanceTab({ memberId, memberName }) {
  const defaultRange = getDateRange(6);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [activePreset, setActivePreset] = useState('Last 6 Months');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewText, setReviewText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadPerformanceData() {
    setLoading(true);
    try {
      const result = await api.get(`/team/${memberId}/performance-review?from=${from}&to=${to}`);
      setData(result);
    } catch (err) {
      console.error('Failed to load performance data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPerformanceData();
  }, [memberId, from, to]);

  function applyPreset(preset) {
    const range = getDateRange(preset.months);
    setFrom(range.from);
    setTo(range.to);
    setActivePreset(preset.label);
  }

  function handleDateChange(field, value) {
    setActivePreset(null);
    if (field === 'from') setFrom(value);
    else setTo(value);
  }

  async function handleSaveReview() {
    if (!reviewText.trim()) return;
    setSaving(true);
    try {
      await api.post('/notes', {
        content: reviewText,
        category: 'performance',
        team_member_id: parseInt(memberId),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save review:', err);
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(reviewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-400">Loading performance data...</div>;
  }

  if (!data) {
    return <div className="text-center py-16 text-gray-400">Failed to load performance data.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Period:</span>
          </div>
          <div className="flex items-center gap-2">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  activePreset === preset.label
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={from}
              onChange={(e) => handleDateChange('from', e.target.value)}
              className="text-sm px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => handleDateChange('to', e.target.value)}
              className="text-sm px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          icon={<CheckCircle size={18} />}
          label="Stories completed"
          value={data.stories_completed.length}
          color="green"
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Story points delivered"
          value={data.total_points}
          color="blue"
        />
        <StatCard
          icon={<Clock size={18} />}
          label="Avg completion (sprints)"
          value={data.avg_sprints_to_complete}
          color="teal"
        />
        <StatCard
          icon={<AlertTriangle size={18} />}
          label="Carry-over rate"
          value={`${data.carry_over_rate}%`}
          color="orange"
          highlight={data.carry_over_rate > 30}
        />
        <StatCard
          icon={<MessageSquare size={18} />}
          label="1:1s conducted"
          value={data.one_on_ones.length}
          color="purple"
        />
      </div>

      {/* Velocity Chart */}
      {data.velocity_by_sprint.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Velocity Over Period</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.velocity_by_sprint}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="sprint" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="points_completed"
                name="Points Completed"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sentiment Timeline */}
      {data.one_on_ones.length >= 2 && (
        <SentimentTimeline oneOnOnes={data.one_on_ones} />
      )}

      {/* Sentiment Summary */}
      {data.one_on_ones.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Sentiment Breakdown</h4>
          <div className="flex items-center gap-6">
            {Object.entries(SENTIMENT_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                <span className="text-sm text-gray-700">{cfg.label}</span>
                <span className="text-sm font-bold text-gray-900">{data.sentiment_summary[key] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible Sections */}
      <CollapsibleSection
        title="Completed Stories"
        icon={<CheckCircle size={16} className="text-green-500" />}
        count={data.stories_completed.length}
        defaultOpen={true}
      >
        {data.stories_completed.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No stories completed in this period.</p>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">Key</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">Summary</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">Project</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">Points</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">Sprints</th>
                </tr>
              </thead>
              <tbody>
                {data.stories_completed.map((story) => (
                  <tr key={story.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 text-xs font-mono text-gray-600">{story.key}</td>
                    <td className="px-3 py-2 text-sm text-gray-900 max-w-xs truncate">{story.summary}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{story.project_name || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{story.story_points ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{story.sprints_to_complete || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="1:1 History"
        icon={<MessageSquare size={16} className="text-purple-500" />}
        count={data.one_on_ones.length}
      >
        {data.one_on_ones.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No 1:1 records in this period.</p>
        ) : (
          <div className="space-y-3 mt-3">
            {data.one_on_ones.map((entry) => {
              const cfg = SENTIMENT_CONFIG[entry.sentiment] || SENTIMENT_CONFIG.neutral;
              const dateStr = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
              });
              return (
                <div key={entry.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-900">{dateStr}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  {entry.talking_points && (
                    <div className="prose prose-sm max-w-none text-gray-700">
                      <ReactMarkdown>{entry.talking_points}</ReactMarkdown>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Notes"
        icon={<FileText size={16} className="text-blue-500" />}
        count={data.notes.length}
      >
        {data.notes.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No performance or 1:1 notes in this period.</p>
        ) : (
          <div className="space-y-3 mt-3">
            {data.notes.map((note) => (
              <div key={note.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    note.category === 'performance' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {note.category}
                  </span>
                  {note.project_name && (
                    <span className="text-xs text-gray-500">{note.project_name}</span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">
                    {new Date(note.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="prose prose-sm max-w-none text-gray-700">
                  <ReactMarkdown>{note.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Blockers"
        icon={<Shield size={16} className="text-red-500" />}
        count={data.blockers_involved.length}
      >
        {data.blockers_involved.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No blockers involving this person in this period.</p>
        ) : (
          <div className="space-y-3 mt-3">
            {data.blockers_involved.map((blocker) => (
              <div key={blocker.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    blocker.status === 'resolved' ? 'bg-green-100 text-green-700'
                      : blocker.status === 'monitoring' ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {blocker.status}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    blocker.severity === 'critical' ? 'bg-red-50 text-red-600'
                      : blocker.severity === 'high' ? 'bg-orange-50 text-orange-600'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {blocker.severity}
                  </span>
                  {blocker.project_name && (
                    <span className="text-xs text-gray-500">{blocker.project_name}</span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-900">{blocker.title}</p>
                {blocker.description && (
                  <p className="text-sm text-gray-600 mt-1">{blocker.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Write Review Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Write Review</h3>
        <p className="text-sm text-gray-500 mb-4">
          Use the data above to write a performance review for {memberName}. Saved as a performance note.
        </p>
        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          rows={12}
          placeholder={`# Performance Review — ${memberName}\n\n## Summary\n\n## Strengths\n\n## Areas for Growth\n\n## Goals for Next Period`}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm mb-4"
        />
        {reviewText.trim() && (
          <div className="mb-4 border border-gray-200 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Preview</h4>
            <div className="prose prose-sm max-w-none text-gray-700">
              <ReactMarkdown>{reviewText}</ReactMarkdown>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveReview}
            disabled={saving || !reviewText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Review'}
          </button>
          <button
            onClick={handleCopy}
            disabled={!reviewText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            <Copy size={14} />
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>
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
