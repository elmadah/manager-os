import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, ArrowRightLeft, Clock, ShieldAlert, UserX } from 'lucide-react';
import api from '../lib/api';
import { isDoneStatus, getStatusStyle, fetchStatuses } from '../lib/statuses';

export default function SprintPulse() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/teams').then(data => {
      setTeams(data.length > 0 ? data : [{ id: null, name: null }]);
    }).catch(() => {
      setTeams([{ id: null, name: null }]);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-center h-32 text-gray-400">Loading sprint data...</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {teams.map(team => (
        <SprintPulseCard key={team.id ?? 'all'} teamId={team.id} teamName={team.name} />
      ))}
    </div>
  );
}

function SprintPulseCard({ teamId, teamName }) {
  const [sprint, setSprint] = useState(null);
  const [stories, setStories] = useState([]);
  const [staleMap, setStaleMap] = useState({});
  const [blockers, setBlockers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeMember, setActiveMember] = useState(null);
  const [teamMemberColors, setTeamMemberColors] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        await fetchStatuses();
        const params = teamId ? `?team_id=${teamId}` : '';
        const sprints = await api.get(`/sprints${params}`);
        if (cancelled) return;

        if (!sprints.length) {
          setSprint(null);
          setStories([]);
          setLoading(false);
          return;
        }

        const current = sprints[0];
        setSprint(current);

        const [storiesData, staleData, blockersData, teamData] = await Promise.all([
          api.get(`/sprints/${encodeURIComponent(current.sprint)}/stories${params}`),
          api.get('/standups/stale').catch(() => ({})),
          api.get('/blockers?status=active').catch(() => []),
          api.get('/team').catch(() => []),
        ]);

        if (cancelled) return;
        setStories(storiesData);
        setStaleMap(staleData);
        setBlockers(blockersData);
        const colorMap = {};
        teamData.forEach(m => { colorMap[m.name] = m.color || '#9ca3af'; });
        setTeamMemberColors(colorMap);
      } catch (err) {
        console.error('Failed to load sprint pulse:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [teamId]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-center h-32 text-gray-400">Loading sprint data...</div>
      </div>
    );
  }

  if (!sprint) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm text-center">
        <BarChart3 size={40} className="mx-auto text-gray-300 mb-3" />
        <h3 className="text-base font-semibold text-gray-700 mb-1">No sprint data yet</h3>
        <p className="text-sm text-gray-500">Import from Jira to see your Sprint Pulse.</p>
      </div>
    );
  }

  // Compute flags
  const carryOvers = stories.filter(s => s.sprint_status === 'carried_over');
  const unassigned = stories.filter(s => !s.assignee_id && !isDoneStatus(s.status));

  // Stuck: not done and in stale map
  const staleStoryIds = new Set(Object.keys(staleMap).map(k => parseInt(k.split('-')[0])));
  const stuck = stories.filter(s => !isDoneStatus(s.status) && staleStoryIds.has(s.id));

  // Blocked: active blockers whose feature_id or team_member_id overlaps with sprint stories
  const storyFeatureIds = new Set(stories.filter(s => s.feature_id).map(s => s.feature_id));
  const storyAssigneeIds = new Set(stories.filter(s => s.assignee_id).map(s => s.assignee_id));
  const relevantBlockers = blockers.filter(b =>
    (b.feature_id && storyFeatureIds.has(b.feature_id)) ||
    (b.team_member_id && storyAssigneeIds.has(b.team_member_id))
  );

  // Build blocked story IDs (stories in features or assigned to members with blockers)
  const blockedFeatureIds = new Set(relevantBlockers.filter(b => b.feature_id).map(b => b.feature_id));
  const blockedMemberIds = new Set(relevantBlockers.filter(b => b.team_member_id).map(b => b.team_member_id));
  const blocked = stories.filter(s =>
    !isDoneStatus(s.status) && (
      (s.feature_id && blockedFeatureIds.has(s.feature_id)) ||
      (s.assignee_id && blockedMemberIds.has(s.assignee_id))
    )
  );

  const flags = [
    { key: 'carry-overs', label: 'Carry-overs', count: carryOvers.length, color: 'orange', icon: ArrowRightLeft },
    { key: 'stuck', label: 'Stuck', count: stuck.length, color: 'red', icon: Clock },
    { key: 'blocked', label: 'Blocked', count: blocked.length, color: 'red', icon: ShieldAlert },
    { key: 'unassigned', label: 'Unassigned', count: unassigned.length, color: 'yellow', icon: UserX },
  ].filter(f => f.count > 0);

  // Team member data
  const memberMap = {};
  for (const s of stories) {
    if (!s.assignee_id) continue;
    if (!memberMap[s.assignee_id]) {
      memberMap[s.assignee_id] = { id: s.assignee_id, name: s.assignee, stories: [] };
    }
    memberMap[s.assignee_id].stories.push(s);
  }
  const members = Object.values(memberMap).sort((a, b) => a.name.localeCompare(b.name));

  // Member status dot colors
  function getMemberStatus(member) {
    const memberStories = member.stories;
    const memberCarryOvers = memberStories.filter(s => s.sprint_status === 'carried_over');
    const hasBlocked = memberStories.some(s =>
      !isDoneStatus(s.status) && (
        (s.feature_id && blockedFeatureIds.has(s.feature_id)) ||
        (s.assignee_id && blockedMemberIds.has(s.assignee_id))
      )
    );

    if (hasBlocked || memberCarryOvers.length >= 2) return 'red';

    const hasStuck = memberStories.some(s => !isDoneStatus(s.status) && staleStoryIds.has(s.id));
    const hasUnassigned = false; // member has stories, so they're assigned
    if (hasStuck || hasUnassigned) return 'orange';

    return 'green';
  }

  const completed = sprint.completed;
  const total = sprint.total_stories;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h2 className="text-lg font-bold text-gray-900">
          {teamName ? teamName : 'Sprint Pulse'}
        </h2>
        <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
          {sprint.sprint}
        </span>
      </div>

      {/* Main content: ring + flags */}
      <div className="flex items-center gap-8 px-6 pb-5">
        <ProgressRing completed={completed} total={total} pct={pct} />
        <div className="flex flex-wrap gap-2">
          {flags.map(f => (
            <FlagBadge key={f.key} flag={f} />
          ))}
          {flags.length === 0 && (
            <span className="text-sm text-green-600 font-medium">All clear — no attention items</span>
          )}
        </div>
      </div>

      {/* Team member row */}
      {members.length > 0 && (
        <div className="border-t border-gray-100 px-6 py-4">
          <div className="flex flex-wrap gap-3">
            {members.map(m => (
              <MemberAvatar
                key={m.id}
                member={m}
                status={getMemberStatus(m)}
                isActive={activeMember?.id === m.id}
                onClick={() => setActiveMember(activeMember?.id === m.id ? null : m)}
                staleStoryIds={staleStoryIds}
                blockedFeatureIds={blockedFeatureIds}
                blockedMemberIds={blockedMemberIds}
                color={teamMemberColors[m.name]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressRing({ completed, total, pct }) {
  const size = 88;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#f3f4f6" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-gray-900 leading-none">{completed}/{total}</span>
        <span className="text-xs text-gray-500">done</span>
      </div>
    </div>
  );
}

const FLAG_COLORS = {
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  yellow: 'bg-amber-50 text-amber-700 border-amber-200',
};

function FlagBadge({ flag }) {
  const Icon = flag.icon;
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${FLAG_COLORS[flag.color]}`}>
      <Icon size={14} />
      <span>{flag.count}</span>
      <span className="hidden sm:inline">{flag.label}</span>
    </div>
  );
}

const DOT_COLORS = {
  green: 'bg-green-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
};

function MemberAvatar({ member, status, isActive, onClick, staleStoryIds, blockedFeatureIds, blockedMemberIds, color }) {
  const ref = useRef(null);
  const navigate = useNavigate();
  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // Close on click outside
  useEffect(() => {
    if (!isActive) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClick();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isActive, onClick]);

  const displayStories = member.stories.slice(0, 10);
  const remaining = member.stories.length - displayStories.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={onClick}
        className={`flex flex-col items-center gap-1 group ${isActive ? 'opacity-100' : ''}`}
        title={member.name}
      >
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white transition-all ${
            isActive ? 'ring-2 ring-blue-300 ring-offset-2' : 'group-hover:opacity-80'
          }`}
          style={{ backgroundColor: color || '#9ca3af' }}
        >
          {initials}
        </div>
        <div className={`w-2.5 h-2.5 rounded-full ${DOT_COLORS[status]}`} />
      </button>

      {/* Popover */}
      {isActive && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="font-semibold text-gray-900 text-sm">{member.name}</div>
            <div className="text-xs text-gray-500">{member.stories.length} stories in sprint</div>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {displayStories.map(s => (
              <StoryRow
                key={s.id}
                story={s}
                isStale={staleStoryIds.has(s.id)}
                isBlocked={
                  (s.feature_id && blockedFeatureIds.has(s.feature_id)) ||
                  (s.assignee_id && blockedMemberIds.has(s.assignee_id))
                }
              />
            ))}
          </div>
          {remaining > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-500">
              and {remaining} more
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-gray-100">
            <button
              onClick={() => navigate('/sprints')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              View in Sprints →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StoryRow({ story, isStale, isBlocked }) {
  const pillClass = getStatusStyle(story.status);

  return (
    <div className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {story.key && (
            <span className="text-xs font-mono text-gray-400 shrink-0">{story.key}</span>
          )}
          {isBlocked && <ShieldAlert size={12} className="text-red-500 shrink-0" />}
          {isStale && !isDoneStatus(story.status) && <Clock size={12} className="text-orange-500 shrink-0" />}
          {story.sprint_status === 'carried_over' && <ArrowRightLeft size={12} className="text-orange-500 shrink-0" />}
        </div>
        <div className="text-gray-700 truncate">{story.summary}</div>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${pillClass}`}>
        {story.status}
      </span>
    </div>
  );
}
