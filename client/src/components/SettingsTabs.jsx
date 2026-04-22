import { NavLink } from 'react-router-dom';

const SETTINGS_TABS = [
  { to: '/settings', label: 'General', end: true },
  { to: '/settings/import-export', label: 'Import & Export' },
  { to: '/settings/about', label: 'About' },
];

export default function SettingsTabs() {
  return (
    <div className="flex gap-1 mb-6 border-b border-gray-200">
      {SETTINGS_TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
