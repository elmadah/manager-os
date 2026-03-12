import { useState, useEffect } from 'react';
import { ChevronDown, CheckCircle2, ArrowRightLeft, Sparkles, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../lib/api';

export default function SprintsPage() {
  const [sprints, setSprints] = useState([]);
  const [selectedSprint, setSelectedSprint] = useState(null);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    async function loadSprints() {
      try {
        const data = await api.get('/sprints');
        setSprints(data);
        if (data.length > 0) {
          setSelectedSprint(data[0]);
        }
      } catch (err) {
        console.error('Failed to load sprints:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSprints();
  }, []);

  useEffect(() => {
    if (!selectedSprint) return;
    async function loadStories() {
      setStoriesLoading(true);
      try {
        const data = await api.get(`/sprints/${encodeURIComponent(selectedSprint.sprint)}/stories`);
        setStories(data);
      } catch (err) {
        console.error('Failed to load sprint stories:', err);
      } finally {
        setStoriesLoading(false);
      }
    }
    loadStories();
  }, [selectedSprint]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    );
  }

  if (sprints.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
        <BarChart3 size={48} className="mx-auto text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">No sprint data yet</h2>
        <p className="text-gray-500">Import sprint data to see sprint analytics here.</p>
      </div>
    );
  }

  const completed = stories.filter(s => s.sprint_status === 'completed');
  const carriedOver = stories.filter(s => s.sprint_status === 'carried_over');
  const newStories = stories.filter(s => s.sprint_status === 'new');

  const comparisonData = sprints.slice(0, 5).reverse().map(s => ({
    sprint: s.sprint.length > 20 ? s.sprint.slice(0, 20) + '…' : s.sprint,
    'Completed Points': s.completed_points,
    'Carry-Overs': s.carried_over,
    'New Stories': s.new_stories,
  }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Sprints</h1>
        <button
          onClick={() => setShowComparison(!showComparison)}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            showComparison
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <BarChart3 size={16} />
          Sprint Comparison
        </button>
      </div>

      {/* Sprint Comparison Chart */}
      {showComparison && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Last 5 Sprints Comparison</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="sprint" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Completed Points" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Carry-Overs" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="New Stories" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sprint Selector */}
      <div className="mb-6">
        <div className="relative inline-block">
          <select
            value={selectedSprint?.sprint || ''}
            onChange={(e) => {
              const s = sprints.find(sp => sp.sprint === e.target.value);
              setSelectedSprint(s);
            }}
            className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2.5 pr-10 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
          >
            {sprints.map(s => (
              <option key={s.sprint} value={s.sprint}>{s.sprint}</option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Metrics Bar */}
      {selectedSprint && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <MetricCard label="Total Stories" value={selectedSprint.total_stories} />
          <MetricCard label="Completed" value={selectedSprint.completed} color="green" />
          <MetricCard label="Carried Over" value={selectedSprint.carried_over} color="orange" />
          <MetricCard label="New Stories" value={selectedSprint.new_stories} color="blue" />
          <MetricCard label="Points Completed" value={selectedSprint.completed_points} color="green" />
          <MetricCard label="Completion Rate" value={`${selectedSprint.completion_rate}%`} color={selectedSprint.completion_rate >= 70 ? 'green' : selectedSprint.completion_rate >= 40 ? 'orange' : 'red'} />
        </div>
      )}

      {/* Story Tables */}
      {storiesLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-400">Loading stories…</div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Completed */}
          <StorySection
            title="Completed"
            icon={<CheckCircle2 size={18} />}
            color="green"
            stories={completed}
            columns={['key', 'summary', 'assignee', 'feature', 'project', 'points', 'sprints_to_complete']}
          />

          {/* Carried Over */}
          <StorySection
            title="Carried Over"
            icon={<ArrowRightLeft size={18} />}
            color="orange"
            stories={carriedOver}
            columns={['key', 'summary', 'assignee', 'feature', 'project', 'points', 'carry_over_count']}
          />

          {/* New */}
          <StorySection
            title="New"
            icon={<Sparkles size={18} />}
            color="blue"
            stories={newStories}
            columns={['key', 'summary', 'assignee', 'feature', 'project', 'points', 'status']}
          />
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }) {
  const colorClasses = {
    green: 'text-green-600',
    orange: 'text-orange-600',
    blue: 'text-blue-600',
    red: 'text-red-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${colorClasses[color] || 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

const headerColors = {
  green: 'bg-green-50 border-green-200 text-green-800',
  orange: 'bg-orange-50 border-orange-200 text-orange-800',
  blue: 'bg-blue-50 border-blue-200 text-blue-800',
};

const columnHeaders = {
  key: 'Key',
  summary: 'Summary',
  assignee: 'Assignee',
  feature: 'Feature',
  project: 'Project',
  points: 'Points',
  sprints_to_complete: 'Sprints to Complete',
  carry_over_count: 'Carry-Over Count',
  status: 'Status',
};

function StorySection({ title, icon, color, stories, columns }) {
  if (stories.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className={`flex items-center gap-2 px-5 py-3 border-b font-semibold text-sm ${headerColors[color]}`}>
          {icon}
          {title} (0)
        </div>
        <div className="p-8 text-center text-gray-400 text-sm">No stories in this section</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className={`flex items-center gap-2 px-5 py-3 border-b font-semibold text-sm ${headerColors[color]}`}>
        {icon}
        {title} ({stories.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {columns.map(col => (
                <th key={col} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {columnHeaders[col]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stories.map(story => (
              <tr key={story.id} className="border-b border-gray-50 hover:bg-gray-50">
                {columns.map(col => (
                  <td key={col} className="px-5 py-3">
                    {renderCell(col, story)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderCell(col, story) {
  switch (col) {
    case 'key':
      return <span className="font-mono text-xs text-blue-600 font-medium">{story.key}</span>;
    case 'summary':
      return <span className="text-gray-900 max-w-md truncate block">{story.summary}</span>;
    case 'assignee':
      return <span className="text-gray-600">{story.assignee || '—'}</span>;
    case 'feature':
      return <span className="text-gray-600">{story.feature_name || '—'}</span>;
    case 'project':
      return <span className="text-gray-600">{story.project_name || '—'}</span>;
    case 'points':
      return <span className="font-medium text-gray-900">{story.story_points || '—'}</span>;
    case 'sprints_to_complete':
      return <span className="text-gray-600">{story.sprints_to_complete || '—'}</span>;
    case 'carry_over_count':
      return (
        <span className={`font-medium ${story.carry_over_count >= 3 ? 'text-red-600' : story.carry_over_count >= 2 ? 'text-orange-600' : 'text-gray-600'}`}>
          {story.carry_over_count || 0}
        </span>
      );
    case 'status':
      return <StatusBadge status={story.status} />;
    default:
      return '—';
  }
}

function StatusBadge({ status }) {
  if (!status) return <span className="text-gray-400">—</span>;

  const lower = status.toLowerCase();
  let classes = 'bg-gray-100 text-gray-700';
  if (lower === 'in progress' || lower === 'in_progress') classes = 'bg-blue-100 text-blue-700';
  else if (lower === 'to do' || lower === 'todo' || lower === 'open') classes = 'bg-gray-100 text-gray-700';
  else if (lower === 'in review' || lower === 'code review') classes = 'bg-purple-100 text-purple-700';

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      {status}
    </span>
  );
}
