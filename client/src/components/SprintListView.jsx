import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import StandupHistoryPopover from './StandupHistoryPopover';
import StoryTable, { getStatusPriority, isDone, getStatusColor } from './StoryTable';

export default function SprintListView({ stories, searchQuery, jiraBaseUrl, onEditStory, onOpenStandup, staleMap, standupHistoryMap, historyPopover, onShowHistory, onCloseHistory }) {
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

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

    const entries = Object.values(map);
    entries.sort((a, b) => {
      if (!a.name) return -1;
      if (!b.name) return 1;
      return a.name.localeCompare(b.name);
    });
    return entries;
  }, [filteredStories]);

  function toggleGroup(name) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function computeGroupStats(groupStories) {
    let total = groupStories.length;
    let storyPoints = 0, done = 0, carryOvers = 0, newCount = 0, openDefects = 0;
    for (const s of groupStories) {
      const type = (s.issue_type || '').toLowerCase();
      const isDefect = type === 'bug' || type === 'defect';
      if (!isDefect) storyPoints += s.story_points || 0;
      if (isDefect && !isDone(s.status)) openDefects++;
      if (s.sprint_status === 'completed') done++;
      else if (s.sprint_status === 'carried_over') carryOvers++;
      else if (s.sprint_status === 'new') newCount++;
    }
    return { total, storyPoints, done, carryOvers, newCount, openDefects };
  }

  if (filteredStories.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        {searchQuery.trim() ? 'No stories match your search.' : 'No stories in this sprint.'}
      </div>
    );
  }

  const storyTableColumns = [
    { key: 'key', label: 'Key', align: 'left' },
    { key: 'summary', label: 'Summary', align: 'left' },
    { key: 'status', label: 'Status', align: 'left' },
    { key: 'assignee', label: 'Assignee', align: 'left' },
    { key: 'story_points', label: 'Points', align: 'right' },
    { key: 'release_date', label: 'Release', align: 'left' },
    { key: 'carry_over_count', label: 'Carry-overs', align: 'right' },
    { key: 'actions', label: 'Actions', align: 'center', sortable: false },
  ];

  return (
    <div className="space-y-4">
      {groups.map(group => {
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
                <span>{stats.storyPoints} pts</span>
                {stats.openDefects > 0 && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-red-600">{stats.openDefects} {stats.openDefects === 1 ? 'defect' : 'defects'}</span>
                  </>
                )}
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
              <StoryTable
                stories={group.stories}
                columns={storyTableColumns}
                defaultSort={{ key: 'status', direction: 'asc' }}
                onEdit={onEditStory}
                jiraBaseUrl={jiraBaseUrl}
                renderCell={{
                  status: (story) => (
                    <StaleStatusCell
                      story={story}
                      staleMap={staleMap}
                      standupHistoryMap={standupHistoryMap}
                      historyPopover={historyPopover}
                      onShowHistory={onShowHistory}
                      onCloseHistory={onCloseHistory}
                    />
                  ),
                  assignee: (story) => (
                    <AssigneeCell
                      name={story.assignee}
                      assigneeId={story.assignee_id}
                      workloadStats={workloadStats}
                      onOpenStandup={onOpenStandup}
                    />
                  ),
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AssigneeCell({ name, assigneeId, workloadStats, onOpenStandup }) {
  if (!name) return <span className="text-gray-400">—</span>;

  const stats = workloadStats.byAssignee[name];
  const overloaded = stats && workloadStats.avgPoints > 0 && stats.points > workloadStats.avgPoints * 1.5;
  const stuckWork = stats && workloadStats.avgCarryOvers > 0 && stats.carryOvers > workloadStats.avgCarryOvers * 1.5;

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={() => onOpenStandup && assigneeId && onOpenStandup(assigneeId, name)}
        className="text-gray-600 hover:text-blue-600 cursor-pointer transition-colors"
        title="Click to log standup"
      >
        {name}
      </button>
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

function StaleStatusCell({ story, staleMap, standupHistoryMap, historyPopover, onShowHistory, onCloseHistory }) {
  const staleKey = `${story.id}-${story.assignee_id}`;
  const daysSstale = staleMap?.[staleKey] || 0;
  const hasHistory = standupHistoryMap?.[story.id];
  const isPopoverOpen = historyPopover?.storyId === story.id;

  return (
    <div className="inline-flex items-center gap-1.5">
      {story.status
        ? <span className={`text-xs ${getStatusColor(story.status)}`}>{story.status}</span>
        : <span className="text-gray-400">—</span>
      }
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
