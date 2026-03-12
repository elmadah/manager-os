import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Plus, Calendar } from 'lucide-react';
import api from '../lib/api';
import CreateProjectModal from '../components/CreateProjectModal';

const COLUMNS = [
  { status: 'upcoming', label: 'Upcoming', headerBg: 'bg-gray-500', columnBg: 'bg-gray-50', borderColor: 'border-gray-300' },
  { status: 'planning', label: 'Planning', headerBg: 'bg-blue-500', columnBg: 'bg-blue-50/50', borderColor: 'border-blue-300' },
  { status: 'active', label: 'Active', headerBg: 'bg-green-500', columnBg: 'bg-green-50/50', borderColor: 'border-green-300' },
  { status: 'wrapping_up', label: 'Wrapping Up', headerBg: 'bg-yellow-500', columnBg: 'bg-yellow-50/50', borderColor: 'border-yellow-300' },
  { status: 'complete', label: 'Complete', headerBg: 'bg-slate-500', columnBg: 'bg-slate-50/50', borderColor: 'border-slate-300' },
];

const HEALTH_COLORS = {
  green: 'border-green-500',
  yellow: 'border-yellow-500',
  red: 'border-red-500',
};

const HEALTH_DOT_COLORS = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
};

export default function PipelinePage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const data = await api.get('/projects');
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  function getColumnProjects(status) {
    return projects.filter((p) => p.status === status);
  }

  async function handleDragEnd(result) {
    const { draggableId, destination, source } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const projectId = parseInt(draggableId, 10);
    const newStatus = destination.droppableId;
    const oldProjects = projects;

    // Optimistic update
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, status: newStatus } : p))
    );

    try {
      await api.put(`/projects/${projectId}`, { status: newStatus });
    } catch (err) {
      console.error('Failed to update project status:', err);
      // Revert on failure
      setProjects(oldProjects);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Pipeline</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Project
        </button>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
          {COLUMNS.map((col) => {
            const colProjects = getColumnProjects(col.status);
            return (
              <div key={col.status} className={`flex flex-col rounded-xl ${col.columnBg} border ${col.borderColor} min-w-[260px] w-[260px] shrink-0`}>
                {/* Column Header */}
                <div className={`${col.headerBg} text-white px-4 py-2.5 rounded-t-xl flex items-center justify-between`}>
                  <span className="font-semibold text-sm">{col.label}</span>
                  <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {colProjects.length}
                  </span>
                </div>

                {/* Droppable Area */}
                <Droppable droppableId={col.status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 p-3 space-y-3 overflow-y-auto transition-colors ${
                        snapshot.isDraggingOver ? 'bg-white/60' : ''
                      }`}
                      style={{ minHeight: 80 }}
                    >
                      {colProjects.length === 0 && !snapshot.isDraggingOver ? (
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center text-sm text-gray-400">
                          No projects
                        </div>
                      ) : (
                        colProjects.map((project, index) => (
                          <Draggable key={project.id} draggableId={String(project.id)} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => navigate(`/projects/${project.id}`)}
                                className={`bg-white rounded-lg border border-gray-200 p-3 shadow-sm cursor-pointer
                                  border-l-4 ${HEALTH_COLORS[project.health]}
                                  ${snapshot.isDragging ? 'shadow-lg rotate-1' : 'hover:shadow-md hover:border-gray-300'}
                                  transition-shadow`}
                              >
                                {/* Project Name + Health Dot */}
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${HEALTH_DOT_COLORS[project.health]}`} />
                                  <span className="font-semibold text-sm text-gray-900 leading-tight truncate">
                                    {project.name}
                                  </span>
                                </div>

                                {/* Feature Count + Story Progress */}
                                <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                                  <span>{project.feature_count} feature{project.feature_count !== 1 ? 's' : ''}</span>
                                  <span>
                                    {project.story_stats.completed_stories}/{project.story_stats.total_stories} stories
                                  </span>
                                </div>

                                {/* Target Date */}
                                {project.target_date && (
                                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                    <Calendar size={12} />
                                    <span>
                                      {new Date(project.target_date).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                      })}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={loadProjects}
      />
    </div>
  );
}
