import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Columns3,
  Users,
  RefreshCw,
  CalendarCheck,
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
  { to: '/capacity', label: 'Capacity', icon: CalendarCheck },
  { to: '/todos', label: 'Todos', icon: CheckSquare },
  { to: '/blockers', label: 'Blockers', icon: AlertTriangle },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/digest', label: 'Digest', icon: Newspaper },
];

export default function Layout() {
  const location = useLocation();
  const isSettingsActive = location.pathname.startsWith('/settings');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed top-0 left-0 h-screen bg-slate-800 text-white flex flex-col transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-5 border-b border-slate-700">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-blue-400 hover:text-blue-300 transition-colors shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <LayoutDashboard className="h-6 w-6" />
          </button>
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight">ManagerOS</span>
          )}
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                } ${collapsed ? 'justify-center' : ''}`
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>
        <div className="px-2 py-4 border-t border-slate-700 space-y-1">
          <NavLink
            to="/settings"
            title={collapsed ? 'Settings' : undefined}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isSettingsActive
                ? 'bg-slate-700 text-white'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            } ${collapsed ? 'justify-center' : ''}`}
          >
            <Settings className="h-5 w-5 shrink-0" />
            {!collapsed && 'Settings'}
          </NavLink>
        </div>
      </aside>
      <main
        className={`flex-1 bg-gray-50 min-h-screen p-8 transition-all duration-300 ${
          collapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
