import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderKanban, Users, AlertTriangle, Zap, ShieldAlert } from 'lucide-react';
import api from '../lib/api';
import CreateProjectModal from '../components/CreateProjectModal';
import Timeline from '../components/timeline/Timeline';

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

export default function HomePage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState({ totalProjects: 0, activeProjects: 0, teamMembers: 0, overdueTodos: 0, activeBlockers: 0 });
  const [blockerCounts, setBlockerCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  async function loadData() {
    try {
      const [projectsData, teamData, overdueTodos, activeBlockers] = await Promise.all([
        api.get('/projects'),
        api.get('/team'),
        api.get('/todos?overdue=true'),
        api.get('/blockers?status=active').catch(() => []),
      ]);

      setProjects(projectsData);

      // Count blockers per project (only critical + high)
      const counts = {};
      for (const b of activeBlockers) {
        if (b.project_id && (b.severity === 'critical' || b.severity === 'high')) {
          counts[b.project_id] = (counts[b.project_id] || 0) + 1;
        }
      }
      setBlockerCounts(counts);

      setStats({
        totalProjects: projectsData.length,
        activeProjects: projectsData.filter((p) => p.status === 'active').length,
        teamMembers: teamData.length,
        overdueTodos: overdueTodos.length,
        activeBlockers: activeBlockers.length,
      });
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          New Project
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard icon={<FolderKanban size={20} />} label="Total Projects" value={stats.totalProjects} color="blue" />
        <StatCard icon={<Zap size={20} />} label="Active Projects" value={stats.activeProjects} color="green" />
        <StatCard icon={<Users size={20} />} label="Team Members" value={stats.teamMembers} color="purple" />
        <StatCard icon={<AlertTriangle size={20} />} label="Overdue Todos" value={stats.overdueTodos} color="red" />
        <StatCard icon={<ShieldAlert size={20} />} label="Active Blockers" value={stats.activeBlockers} color="orange" />
      </div>

      {/* Project Grid */}
      {projects.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <FolderKanban size={48} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">No projects yet</h2>
          <p className="text-gray-500 mb-6">Create your first project to get started.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Create your first project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              blockerCount={blockerCounts[project.id] || 0}
              onClick={() => navigate(`/projects/${project.id}`)}
            />
          ))}
        </div>
      )}

      {/* Project Timeline */}
      <div className="mt-8">
        <Timeline />
      </div>

      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={loadData}
      />
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
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg ${colorMap[color]}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function ProjectCard({ project, blockerCount, onClick }) {
  const { story_stats: ss } = project;
  const progress = ss.total_stories > 0 ? Math.round((ss.completed_stories / ss.total_stories) * 100) : 0;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer"
    >
      {/* Name + Status + Health */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-900 leading-tight">{project.name}</h3>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          <span className={`w-2.5 h-2.5 rounded-full ${HEALTH_COLORS[project.health]}`} />
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${STATUS_STYLES[project.status]}`}>
            {STATUS_LABELS[project.status]}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-gray-500">Stories</span>
          <span className="font-medium text-gray-700">{ss.completed_stories} / {ss.total_stories} ({progress}%)</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Metrics Row */}
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>{ss.completed_points} / {ss.total_points} pts</span>
        <span>{project.feature_count} feature{project.feature_count !== 1 ? 's' : ''}</span>
        {blockerCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
            {blockerCount} blocker{blockerCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Target Date */}
      {project.target_date && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-500">
          Target: {new Date(project.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </div>
  );
}
