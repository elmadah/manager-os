import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, ArrowUp, ArrowDown, Pencil } from 'lucide-react';

const STATUS_PRIORITY = {
  'in progress': 0,
  'in_progress': 0,
  'in review': 1,
  'code review': 1,
  'to do': 2,
  'todo': 2,
  'open': 2,
  'done': 3,
  'closed': 3,
};

function getStatusPriority(status) {
  if (!status) return 99;
  return STATUS_PRIORITY[status.toLowerCase()] ?? 50;
}

function isDone(status) {
  if (!status) return false;
  const lower = status.toLowerCase();
  return lower === 'done' || lower === 'closed' || lower === 'resolved';
}

const COLUMNS = [
  { key: 'key', label: 'Key', align: 'left', sortable: true },
  { key: 'summary', label: 'Summary', align: 'left', sortable: true },
  { key: 'sprint', label: 'Sprint', align: 'left', sortable: true },
  { key: 'status', label: 'Status', align: 'left', sortable: true },
  { key: 'assignee', label: 'Assignee', align: 'left', sortable: true },
  { key: 'story_points', label: 'Points', align: 'right', sortable: true },
  { key: 'release_date', label: 'Release', align: 'left', sortable: true },
  { key: 'carry_over_count', label: 'Carry-overs', align: 'right', sortable: true },
  { key: 'actions', label: 'Actions', align: 'center', sortable: false },
];

export default function SprintListView({ stories, searchQuery, jiraBaseUrl, onEditStory }) {
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ key: 'status', direction: 'asc' });

  // Compute workload stats across all stories (before filtering)
  const workloadStats = useMemo(() => {
    const byAssignee = {};
    for (const s of stories) {
      const name = s.assignee || 'Unassigned';
      if (!byAssignee[name]) byAssignee[name] = { points: 0, carryOvers: 0 };
      byAssignee[name].points += s.story_points || 0;
      byAssignee[name].carryOvers += s.carry_over_count || 0;
    }
    const assignees = Object.keys(byAssignee).filter(n => n !== 'Unassigned');
    const count = assignees.length || 1;
    const avgPoints = assignees.reduce((sum, n) => sum + byAssignee[n].points, 0) / count;
    const avgCarryOvers = assignees.reduce((sum, n) => sum + byAssignee[n].carryOvers, 0) / count;
    return { byAssignee, avgPoints, avgCarryOvers };
  }, [stories]);

  // Filter stories by search
  const filteredStories = useMemo(() => {
    if (!searchQuery.trim()) return stories;
    const q = searchQuery.toLowerCase();
    return stories.filter(s =>
      (s.key && s.key.toLowerCase().includes(q)) ||
      (s.summary && s.summary.toLowerCase().includes(q))
    );
  }, [stories, searchQuery]);

  // Group by project
  const groups = useMemo(() => {
    const map = {};
    for (const s of filteredStories) {
      const project = s.project_name || null;
      if (!map[project]) map[project] = { name: project, color: s.project_color, stories: [] };
      map[project].stories.push(s);
    }

    // Sort groups: Unassigned first, then alphabetical
    const entries = Object.values(map);
    entries.sort((a, b) => {
      if (!a.name) return -1;
      if (!b.name) return 1;
      return a.name.localeCompare(b.name);
    });
    return entries;
  }, [filteredStories]);

  // Sort stories within groups
  const sortedGroups = useMemo(() => {
    return groups.map(group => ({
      ...group,
      stories: [...group.stories].sort((a, b) => {
        const { key, direction } = sortConfig;
        const mult = direction === 'asc' ? 1 : -1;

        if (key === 'status') {
          return mult * (getStatusPriority(a.status) - getStatusPriority(b.status));
        }
        if (key === 'story_points' || key === 'carry_over_count') {
          return mult * ((a[key] || 0) - (b[key] || 0));
        }
        const aVal = (a[key] || '').toString().toLowerCase();
        const bVal = (b[key] || '').toString().toLowerCase();
        return mult * aVal.localeCompare(bVal);
      }),
    }));
  }, [groups, sortConfig]);

  function toggleGroup(name) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleSort(key) {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  function computeGroupStats(groupStories) {
    let total = groupStories.length;
    let points = 0, done = 0, carryOvers = 0, newCount = 0;
    for (const s of groupStories) {
      points += s.story_points || 0;
      if (s.sprint_status === 'completed') done++;
      else if (s.sprint_status === 'carried_over') carryOvers++;
      else if (s.sprint_status === 'new') newCount++;
    }
    return { total, points, done, carryOvers, newCount };
  }

  if (filteredStories.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        {searchQuery.trim() ? 'No stories match your search.' : 'No stories in this sprint.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedGroups.map(group => {
        const groupKey = group.name || '__unassigned__';
        const collapsed = collapsedGroups.has(groupKey);
        const stats = computeGroupStats(group.stories);

        return (
          <div key={groupKey} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(groupKey)}
              className="w-full flex items-center gap-3 px-5 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left"
            >
              {collapsed
                ? <ChevronRight size={16} className="text-gray-400 shrink-0" />
                : <ChevronDown size={16} className="text-gray-400 shrink-0" />
              }
              {group.color && (
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: group.color }}
                />
              )}
              <span className="font-semibold text-gray-900 text-sm">
                {group.name || 'Unassigned'}
              </span>
              <div className="flex items-center gap-3 ml-auto text-xs text-gray-500">
                <span>{stats.total} {stats.total === 1 ? 'story' : 'stories'}</span>
                <span className="text-gray-300">·</span>
                <span>{stats.points} pts</span>
                <span className="text-gray-300">·</span>
                <span className="text-green-600">{stats.done} done</span>
                <span className="text-gray-300">·</span>
                <span className="text-orange-600">{stats.carryOvers} carry-overs</span>
                <span className="text-gray-300">·</span>
                <span className="text-blue-600">{stats.newCount} new</span>
              </div>
            </button>

            {/* Stories Table */}
            {!collapsed && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {COLUMNS.map(col => (
                        <th
                          key={col.key}
                          className={`px-5 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide ${
                            col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                          } ${col.sortable ? 'cursor-pointer hover:text-gray-700 select-none' : ''}`}
                          onClick={col.sortable ? () => handleSort(col.key) : undefined}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {col.sortable && sortConfig.key === col.key && (
                              sortConfig.direction === 'asc'
                                ? <ArrowUp size={12} />
                                : <ArrowDown size={12} />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.stories.map(story => (
                      <tr key={story.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-2.5">
                          <span className="font-mono text-xs text-blue-600 font-medium">{story.key}</span>
                        </td>
                        <td className="px-5 py-2.5 max-w-xs">
                          <span className="text-gray-900 truncate block" title={story.summary}>
                            {story.summary && story.summary.length > 60
                              ? story.summary.slice(0, 60) + '…'
                              : story.summary}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-gray-600 text-xs">{story.sprint || '—'}</td>
                        <td className="px-5 py-2.5">
                          <StatusBadge status={story.status} />
                        </td>
                        <td className="px-5 py-2.5">
                          <AssigneeCell
                            name={story.assignee}
                            workloadStats={workloadStats}
                          />
                        </td>
                        <td className="px-5 py-2.5 text-right font-medium text-gray-900">
                          {story.story_points || '—'}
                        </td>
                        <td className="px-5 py-2.5 text-gray-600 text-xs">
                          {story.release_date || '—'}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <span className={`font-medium ${
                            (story.carry_over_count || 0) >= 3
                              ? 'text-red-600 font-bold'
                              : (story.carry_over_count || 0) > 0
                                ? 'text-orange-600'
                                : 'text-gray-400'
                          }`}>
                            {story.carry_over_count || 0}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-center">
                          <div className="inline-flex items-center gap-2">
                            {onEditStory && (
                              <button
                                onClick={() => onEditStory(story)}
                                className="text-gray-400 hover:text-blue-600 transition-colors"
                                title="Edit story"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            {jiraBaseUrl && story.key ? (
                              <a
                                href={`${jiraBaseUrl}/browse/${story.key}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-gray-400 hover:text-blue-600 transition-colors"
                                title="Open in Jira"
                              >
                                <ExternalLink size={14} />
                              </a>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status) return <span className="text-gray-400">—</span>;

  const lower = status.toLowerCase();
  let classes = 'bg-gray-100 text-gray-700';
  if (isDone(lower)) classes = 'bg-green-100 text-green-700';
  else if (lower === 'in progress' || lower === 'in_progress') classes = 'bg-blue-100 text-blue-700';
  else if (lower === 'in review' || lower === 'code review') classes = 'bg-purple-100 text-purple-700';

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      {status}
    </span>
  );
}

function AssigneeCell({ name, workloadStats }) {
  if (!name) return <span className="text-gray-400">—</span>;

  const stats = workloadStats.byAssignee[name];
  const overloaded = stats && workloadStats.avgPoints > 0 && stats.points > workloadStats.avgPoints * 1.5;
  const stuckWork = stats && workloadStats.avgCarryOvers > 0 && stats.carryOvers > workloadStats.avgCarryOvers * 1.5;

  return (
    <span className="inline-flex items-center gap-1.5 text-gray-600">
      {name}
      {overloaded && (
        <span
          className="w-2 h-2 rounded-full bg-orange-400 shrink-0"
          title={`${stats.points} pts assigned (team avg: ${Math.round(workloadStats.avgPoints)})`}
        />
      )}
      {stuckWork && (
        <span
          className="w-2 h-2 rounded-full bg-red-400 shrink-0"
          title={`${stats.carryOvers} carry-overs (team avg: ${Math.round(workloadStats.avgCarryOvers * 10) / 10})`}
        />
      )}
    </span>
  );
}
