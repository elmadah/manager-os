import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Columns3,
  Users,
  RefreshCw,
  CheckSquare,
  AlertTriangle,
  StickyNote,
  Upload,
  Newspaper,
  Download,
} from 'lucide-react';
import { useToast } from './ToastProvider';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: Columns3 },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/sprints', label: 'Sprints', icon: RefreshCw },
  { to: '/todos', label: 'Todos', icon: CheckSquare },
  { to: '/blockers', label: 'Blockers', icon: AlertTriangle },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/digest', label: 'Digest', icon: Newspaper },
  { to: '/import', label: 'Import', icon: Upload },
];

export default function Layout() {
  const toast = useToast();

  async function handleExport() {
    try {
      const res = await fetch(`${BASE_URL}/export`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `manager-os-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Data exported successfully');
    } catch {
      toast.error('Failed to export data');
    }
  }

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
        <div className="px-3 py-4 border-t border-slate-700">
          <button
            onClick={handleExport}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors w-full"
          >
            <Download className="h-5 w-5" />
            Export Data
          </button>
        </div>
      </aside>
      <main className="ml-64 flex-1 bg-gray-50 min-h-screen p-8">
        <Outlet />
      </main>
    </div>
  );
}
