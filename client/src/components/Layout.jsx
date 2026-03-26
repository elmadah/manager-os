import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Columns3,
  Users,
  RefreshCw,
  CheckSquare,
  AlertTriangle,
  StickyNote,
  Newspaper,
  Settings,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: Columns3 },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/sprints', label: 'Sprints', icon: RefreshCw },
  { to: '/todos', label: 'Todos', icon: CheckSquare },
  { to: '/blockers', label: 'Blockers', icon: AlertTriangle },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/digest', label: 'Digest', icon: Newspaper },
];

export default function Layout() {
  const location = useLocation();
  const isSettingsActive = location.pathname.startsWith('/settings');

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
        <div className="px-3 py-4 border-t border-slate-700 space-y-1">
          <NavLink
            to="/settings"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isSettingsActive
                ? 'bg-slate-700 text-white'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <Settings className="h-5 w-5" />
            Settings
          </NavLink>
        </div>
      </aside>
      <main className="ml-64 flex-1 bg-gray-50 min-h-screen p-8">
        <Outlet />
      </main>
    </div>
  );
}
