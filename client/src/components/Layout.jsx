import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  Columns3,
  Users,
  RefreshCw,
  CheckSquare,
  AlertTriangle,
  StickyNote,
  Upload,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/pipeline', label: 'Pipeline', icon: Columns3 },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/sprints', label: 'Sprints', icon: RefreshCw },
  { to: '/todos', label: 'Todos', icon: CheckSquare },
  { to: '/blockers', label: 'Blockers', icon: AlertTriangle },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/import', label: 'Import', icon: Upload },
];

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed top-0 left-0 h-screen w-64 bg-slate-800 text-white flex flex-col">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-slate-700">
          <LayoutDashboard className="h-6 w-6 text-blue-400" />
          <span className="text-lg font-bold tracking-tight">ManagerOS</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="ml-64 flex-1 bg-gray-50 min-h-screen p-8">
        <Outlet />
      </main>
    </div>
  );
}
