import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, CheckCircle2, ArrowRightLeft, Sparkles, BarChart3, Search, Pencil, ClipboardList } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../lib/api';
import SprintListView from '../components/SprintListView';
import StoryEditModal from '../components/StoryEditModal';
import StandupModal from '../components/StandupModal';
import StandupHistoryPopover from '../components/StandupHistoryPopover';

export default function SprintsPage() {
  const [sprints, setSprints] = useState([]);
  const [selectedSprint, setSelectedSprint] = useState(null);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [viewMode, setViewMode] = useState('project');
  const [searchQuery, setSearchQuery] = useState('');
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');
  const [editingStory, setEditingStory] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [standupMember, setStandupMember] = useState(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [staleMap, setStaleMap] = useState({});
  const [standupHistoryMap, setStandupHistoryMap] = useState({});
  const [historyPopover, setHistoryPopover] = useState(null);
  const [selectedMembers, setSelectedMembers] = useState(new Set());

  const fetchStaleData = useCallback(async () => {
    try {
      const data = await api.get('/standups/stale');
      setStaleMap(data);
    } catch {
      setStaleMap({});
    }
  }, []);

  const fetchStandupHistory = useCallback(async () => {
    try {
      const ids = await api.get('/standups/stories-with-history');
      const map = {};
      for (const id of ids) map[id] = true;
      setStandupHistoryMap(map);
    } catch {
      setStandupHistoryMap({});
    }
  }, []);

  useEffect(() => {
    api.get('/teams').then(data => {
      setTeams(data);
      if (data.length > 0 && !selectedTeamId) {
        setSelectedTeamId(String(data[0].id));
      }
    }).catch(() => {});
    api.get('/team').then(setTeamMembers).catch(() => {});
    api.get('/settings/jira').then(data => {
      if (data.base_url) setJiraBaseUrl(data.base_url.replace(/\/+$/, ''));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    async function loadSprints() {
      try {
        const params = selectedTeamId ? `?team_id=${selectedTeamId}` : '';
        const data = await api.get(`/sprints${params}`);
        setSprints(data);
        if (data.length > 0) {
          // Preserve current sprint selection if it exists in filtered list
          const current = selectedSprint?.sprint;
          const match = current && data.find(s => s.sprint === current);
          setSelectedSprint(match || data[0]);
        } else {
          setSelectedSprint(null);
          setStories([]);
        }
      } catch (err) {
        console.error('Failed to load sprints:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSprints();
  }, [selectedTeamId]);

  useEffect(() => {
    if (!selectedSprint) return;
    async function loadStories() {
      setStoriesLoading(true);
      try {
        const params = selectedTeamId ? `?team_id=${selectedTeamId}` : '';
        const data = await api.get(`/sprints/${encodeURIComponent(selectedSprint.sprint)}/stories${params}`);
        setStories(data);
      } catch (err) {
        console.error('Failed to load sprint stories:', err);
      } finally {
        setStoriesLoading(false);
      }
    }
    loadStories();
  }, [selectedSprint, selectedTeamId]);

  // Fetch stale data and standup history whenever stories change
  useEffect(() => {
    if (stories.length > 0) {
      fetchStaleData();
      fetchStandupHistory();
    }
  }, [stories, fetchStaleData, fetchStandupHistory]);

  function handleOpenStandup(memberId, memberName) {
    setStandupMember({ id: memberId, name: memberName });
  }

  function handleStandupSaved() {
    setStandupMember(null);
    fetchStaleData();
    fetchStandupHistory();
  }

  async function handleUpdateStory(storyId, data) {
    try {
      await api.put(`/stories/${storyId}`, data);
      // Refresh stories for current sprint
      const params = selectedTeamId ? `?team_id=${selectedTeamId}` : '';
      const refreshed = await api.get(`/sprints/${encodeURIComponent(selectedSprint.sprint)}/stories${params}`);
      setStories(refreshed);
      setEditingStory(null);
    } catch (err) {
      console.error('Failed to update story:', err);
    }
  }

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

  const filteredStories = selectedMembers.size > 0
    ? stories.filter(s => selectedMembers.has(s.assignee_id))
    : stories;

  const completed = filteredStories.filter(s => s.sprint_status === 'completed');
  const carriedOver = filteredStories.filter(s => s.sprint_status === 'carried_over');
  const newStories = filteredStories.filter(s => s.sprint_status === 'new');

  const AVATAR_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4','#ef4444','#6366f1','#14b8a6','#f97316'];
  const memberColorMap = {};
  teamMembers.forEach((m, i) => {
    memberColorMap[m.name] = m.color || AVATAR_COLORS[i % AVATAR_COLORS.length];
  });

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
        <div className="flex items-center gap-3">
          {teams.length > 0 && (
            <div className="relative">
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-10 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
              >
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
          <div className="relative">
            <button
              onClick={() => setShowMemberPicker(!showMemberPicker)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              <ClipboardList size={16} />
              Log Standup
            </button>
            {showMemberPicker && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-40 w-48 py-1">
                {teamMembers.map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setShowMemberPicker(false);
                      handleOpenStandup(m.id, m.name);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {m.name}
                  </button>
                ))}
                {teamMembers.length === 0 && (
                  <div className="px-4 py-2 text-sm text-gray-400">No team members</div>
                )}
              </div>
            )}
          </div>
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

      {/* Sprint Selector + View Controls */}
      <div className="mb-6 flex items-center gap-4 flex-wrap">
        <div className="relative">
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

        {/* Segmented Control */}
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => { setViewMode('status'); setSearchQuery(''); }}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'status'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            By Status
          </button>
          <button
            onClick={() => setViewMode('project')}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'project'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            By Project
          </button>
        </div>

        {/* Search (only in project view) */}
        {viewMode === 'project' && (
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search key or summary…"
              className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-64"
            />
          </div>
        )}
      </div>

      {/* Team Member Avatar Filter */}
      {teamMembers.length > 0 && (
        <div className="mb-6 flex items-center gap-2 flex-wrap">
          {teamMembers.map((m, i) => {
            const initials = m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            const isSelected = selectedMembers.has(m.id);
            const bgColor = memberColorMap[m.name] || '#9ca3af';
            return (
              <button
                key={m.id}
                onClick={() => {
                  setSelectedMembers(prev => {
                    const next = new Set(prev);
                    if (next.has(m.id)) next.delete(m.id);
                    else next.add(m.id);
                    return next;
                  });
                }}
                title={m.name}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                  isSelected
                    ? 'ring-2 ring-blue-500 ring-offset-2'
                    : 'hover:ring-2 hover:ring-gray-300 hover:ring-offset-1'
                }`}
                style={{ backgroundColor: bgColor, color: '#fff' }}
              >
                {initials}
              </button>
            );
          })}
          {selectedMembers.size > 0 && (
            <button
              onClick={() => setSelectedMembers(new Set())}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-1"
            >
              Clear
            </button>
          )}
        </div>
      )}

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
      ) : viewMode === 'project' ? (
        <SprintListView stories={filteredStories} searchQuery={searchQuery} jiraBaseUrl={jiraBaseUrl} onEditStory={setEditingStory} onOpenStandup={handleOpenStandup} staleMap={staleMap} standupHistoryMap={standupHistoryMap} historyPopover={historyPopover} onShowHistory={setHistoryPopover} onCloseHistory={() => setHistoryPopover(null)} memberColorMap={memberColorMap} />
      ) : (
        <div className="space-y-6">
          {/* Completed */}
          <StorySection
            title="Completed"
            icon={<CheckCircle2 size={18} />}
            color="green"
            stories={completed}
            columns={['key', 'summary', 'assignee', 'feature', 'project', 'points', 'sprints_to_complete', 'status', 'actions']}
            onEditStory={setEditingStory}
            onOpenStandup={handleOpenStandup}
            staleMap={staleMap}
            standupHistoryMap={standupHistoryMap}
            historyPopover={historyPopover}
            onShowHistory={setHistoryPopover}
            onCloseHistory={() => setHistoryPopover(null)}
          />

          {/* Carried Over */}
          <StorySection
            title="Carried Over"
            icon={<ArrowRightLeft size={18} />}
            color="orange"
            stories={carriedOver}
            columns={['key', 'summary', 'assignee', 'feature', 'project', 'points', 'carry_over_count', 'status', 'actions']}
            onEditStory={setEditingStory}
            onOpenStandup={handleOpenStandup}
            staleMap={staleMap}
            standupHistoryMap={standupHistoryMap}
            historyPopover={historyPopover}
            onShowHistory={setHistoryPopover}
            onCloseHistory={() => setHistoryPopover(null)}
          />

          {/* New */}
          <StorySection
            title="New"
            icon={<Sparkles size={18} />}
            color="blue"
            stories={newStories}
            columns={['key', 'summary', 'assignee', 'feature', 'project', 'points', 'status', 'actions']}
            onEditStory={setEditingStory}
            onOpenStandup={handleOpenStandup}
            staleMap={staleMap}
            standupHistoryMap={standupHistoryMap}
            historyPopover={historyPopover}
            onShowHistory={setHistoryPopover}
            onCloseHistory={() => setHistoryPopover(null)}
          />
        </div>
      )}

      {editingStory && (
        <StoryEditModal
          story={editingStory}
          teamMembers={teamMembers}
          onClose={() => setEditingStory(null)}
          onSave={handleUpdateStory}
        />
      )}

      {standupMember && (
        <StandupModal
          memberId={standupMember.id}
          memberName={standupMember.name}
          stories={stories}
          onClose={() => setStandupMember(null)}
          onSaved={handleStandupSaved}
        />
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
  actions: '',
};

function StorySection({ title, icon, color, stories, columns, onEditStory, onOpenStandup, staleMap, standupHistoryMap, historyPopover, onShowHistory, onCloseHistory }) {
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
                    {renderCell(col, story, onEditStory, onOpenStandup, staleMap, standupHistoryMap, historyPopover, onShowHistory, onCloseHistory)}
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

function renderCell(col, story, onEditStory, onOpenStandup, staleMap, standupHistoryMap, historyPopover, onShowHistory, onCloseHistory) {
  switch (col) {
    case 'key':
      return <span className="font-mono text-xs text-blue-600 font-medium">{story.key}</span>;
    case 'summary':
      return <span className="text-gray-900 max-w-md truncate block">{story.summary}</span>;
    case 'assignee':
      if (!story.assignee) return <span className="text-gray-600">—</span>;
      return (
        <button
          onClick={() => onOpenStandup && story.assignee_id && onOpenStandup(story.assignee_id, story.assignee)}
          className="text-gray-600 hover:text-blue-600 cursor-pointer transition-colors"
          title="Click to log standup"
        >
          {story.assignee}
        </button>
      );
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
    case 'status': {
      const staleKey = `${story.id}-${story.assignee_id}`;
      const daysSstale = staleMap?.[staleKey] || 0;
      const hasHistory = standupHistoryMap?.[story.id];
      const isPopoverOpen = historyPopover?.storyId === story.id;
      return (
        <div className="inline-flex items-center gap-1.5">
          <StatusBadge status={story.status} />
          {daysSstale > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                onShowHistory?.({ storyId: story.id, storyKey: story.key, storySummary: story.summary, daysSstale, anchorRect: rect });
              }}
              className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0 animate-pulse cursor-pointer"
              title={`Stale for ${daysSstale} days — click to view history`}
            />
          ) : hasHistory ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                onShowHistory?.({ storyId: story.id, storyKey: story.key, storySummary: story.summary, daysSstale: 0, anchorRect: rect });
              }}
              className="w-2 h-2 rounded-full bg-gray-300 shrink-0 cursor-pointer"
              title="View standup history"
            />
          ) : null}
          {isPopoverOpen && (
            <StandupHistoryPopover
              storyId={historyPopover.storyId}
              storyKey={historyPopover.storyKey}
              storySummary={historyPopover.storySummary}
              daysSstale={historyPopover.daysSstale}
              anchorRect={historyPopover.anchorRect}
              onClose={() => onCloseHistory?.()}
            />
          )}
        </div>
      );
    }
    case 'actions':
      return (
        <button
          onClick={() => onEditStory(story)}
          className="text-gray-400 hover:text-blue-600 transition-colors"
          title="Edit story"
        >
          <Pencil size={14} />
        </button>
      );
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
