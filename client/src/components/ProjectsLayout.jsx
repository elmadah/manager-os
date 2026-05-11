import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Plus } from 'lucide-react';
import CreateProjectModal from './CreateProjectModal';

export default function ProjectsLayout() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Project
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[
          { to: '/projects/board', label: 'Board' },
          { to: '/projects/roadmap', label: 'Roadmap' },
        ].map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-blue-600 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <Outlet context={{ refreshKey, requestRefresh: () => setRefreshKey(k => k + 1) }} />
      </div>

      <CreateProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => setRefreshKey(k => k + 1)}
      />
    </div>
  );
}
