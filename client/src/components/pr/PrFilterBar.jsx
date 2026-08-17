import { RefreshCw } from 'lucide-react';

const SCOPES = [
  { value: 'sprint', label: 'Sprint' },
  { value: 'release', label: 'Release' },
  { value: 'range', label: 'Date range' },
  { value: 'all', label: 'All time' },
];

// lastSyncAt is an ISO-8601 UTC string already ending in 'Z' (e.g.
// "2026-08-17T19:44:30Z") — parse it directly, do not append another 'Z'.
function formatSyncedAt(lastSyncAt) {
  if (!lastSyncAt) return 'Never synced';
  const parsed = Date.parse(lastSyncAt);
  if (!Number.isFinite(parsed)) return 'Never synced';

  const diffMs = Date.now() - parsed;
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 5) return 'Synced just now';
  if (diffSec < 60) return `Synced ${diffSec}s ago`;

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `Synced ${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;

  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `Synced ${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;

  const date = new Date(parsed);
  return `Synced ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
      }`}
    >
      {children}
    </button>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export default function PrFilterBar({
  filters, options, onSetFilter, onToggle, onClear, onSync, syncing, lastSyncAt,
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-white">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-gray-400">Scope</span>
        <div className="inline-flex rounded border border-gray-300 overflow-hidden">
          {SCOPES.map((scope) => (
            <button
              key={scope.value}
              type="button"
              onClick={() => onSetFilter('scope', scope.value)}
              className={`px-3 py-1 text-xs border-r border-gray-300 last:border-r-0 ${
                filters.scope === scope.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {scope.label}
            </button>
          ))}
        </div>

        {filters.scope === 'sprint' &&
          options.sprints.map((sprint) => (
            <Chip
              key={sprint}
              active={filters.sprint.includes(sprint)}
              onClick={() => onToggle('sprint', sprint)}
            >
              {sprint}
            </Chip>
          ))}

        {filters.scope === 'release' && (
          <Select
            value={filters.release}
            onChange={(v) => onSetFilter('release', v)}
            options={options.releases.map((r) => ({ value: r, label: r }))}
            placeholder="Pick a release…"
          />
        )}

        {filters.scope === 'range' && (
          <span className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="date"
              value={filters.from}
              onChange={(e) => onSetFilter('from', e.target.value)}
              className="border border-gray-300 rounded px-2 py-1"
            />
            <span>to</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => onSetFilter('to', e.target.value)}
              className="border border-gray-300 rounded px-2 py-1"
            />
          </span>
        )}

        <span className="ml-auto flex items-center gap-2 text-[11px] text-gray-400">
          {formatSyncedAt(lastSyncAt)}
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex items-center gap-1 text-blue-600 hover:underline disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-gray-400">Filters</span>

        <Select
          value={filters.repo[0] || ''}
          onChange={(v) => onSetFilter('repo', v ? [v] : [])}
          options={options.repos.map((r) => ({ value: String(r.id), label: r.slug }))}
          placeholder="All repos"
        />
        <Select
          value={filters.author[0] || ''}
          onChange={(v) => onSetFilter('author', v ? [v] : [])}
          options={options.authors.map((a) => ({ value: String(a.id), label: a.name }))}
          placeholder="All authors"
        />
        <Select
          value={filters.state}
          onChange={(v) => onSetFilter('state', v)}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'merged', label: 'Merged' },
            { value: 'closed', label: 'Closed' },
          ]}
          placeholder="Any state"
        />
        <Select
          value={filters.project}
          onChange={(v) => onSetFilter('project', v)}
          options={options.projects.map((p) => ({ value: String(p.id), label: p.name }))}
          placeholder="All projects"
        />
        <Select
          value={filters.reviewer}
          onChange={(v) => onSetFilter('reviewer', v)}
          options={options.authors.map((a) => ({ value: String(a.id), label: a.name }))}
          placeholder="Any reviewer"
        />

        <button
          type="button"
          onClick={onClear}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
