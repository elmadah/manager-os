import { ChevronLeft, ChevronRight } from 'lucide-react';
import { parseLocalDate, formatLocalDate, addMonths, defaultRange, snapToQuarterStart } from '../lib/roadmap';

const STATUSES = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'wrapping_up', label: 'Wrapping up' },
  { value: 'complete', label: 'Complete' },
];

const HEALTHS = [
  { value: 'green', label: 'On track' },
  { value: 'yellow', label: 'At risk' },
  { value: 'red', label: 'Off track' },
];

function presetRange(preset) {
  const now = new Date();
  switch (preset) {
    case '3m': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
      return { start: formatLocalDate(start), end: formatLocalDate(end) };
    }
    case '6m': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 6, 0);
      return { start: formatLocalDate(start), end: formatLocalDate(end) };
    }
    case '12m':
    default:
      return defaultRange(now);
  }
}

export default function RoadmapToolbar({ params, setParams }) {
  const { start, end, status, health } = params;

  function setRangePreset(preset) {
    const { start, end } = presetRange(preset);
    setParams({ ...params, start, end, preset });
  }

  function shiftWindow(direction) {
    const s = parseLocalDate(start);
    const e = parseLocalDate(end);
    const months = Math.round((e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())) || 1;
    const shift = Math.max(1, Math.round(months / 2)) * (direction === 'next' ? 1 : -1);
    const newStart = snapToQuarterStart(addMonths(s, shift));
    const newEnd = new Date(newStart.getFullYear(), newStart.getMonth() + months + 1, 0);
    setParams({ ...params, start: formatLocalDate(newStart), end: formatLocalDate(newEnd), preset: 'custom' });
  }

  function goToday() {
    setRangePreset('12m');
  }

  function toggleSet(field, value) {
    const set = new Set(params[field] || []);
    set.has(value) ? set.delete(value) : set.add(value);
    setParams({ ...params, [field]: Array.from(set) });
  }

  return (
    <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white"
          value={params.preset || '12m'}
          onChange={e => setRangePreset(e.target.value)}
        >
          <option value="3m">Range: Next 3 months</option>
          <option value="6m">Range: Next 6 months</option>
          <option value="12m">Range: Next 12 months (by quarter)</option>
          <option value="custom" disabled>Custom</option>
        </select>

        <MultiSelect label="Status" options={STATUSES} selected={status} onToggle={v => toggleSet('status', v)} />
        <MultiSelect label="Health" options={HEALTHS} selected={health} onToggle={v => toggleSet('health', v)} />
      </div>

      <div className="flex items-center gap-1">
        <button onClick={goToday} className="text-sm px-3 py-1 border border-gray-200 rounded-md bg-white hover:bg-gray-50">Today</button>
        <button onClick={() => shiftWindow('prev')} aria-label="Previous" className="p-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50">
          <ChevronLeft size={16} />
        </button>
        <button onClick={() => shiftWindow('next')} aria-label="Next" className="p-1.5 border border-gray-200 rounded-md bg-white hover:bg-gray-50">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function MultiSelect({ label, options, selected, onToggle }) {
  const count = (selected || []).length;
  const summary = count === 0 ? 'All' : count === options.length ? 'All' : `${count} selected`;
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer text-sm border border-gray-200 rounded-md px-2 py-1 bg-white select-none">
        {label}: {summary}
      </summary>
      <div className="absolute z-10 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg p-2">
        {options.map(o => (
          <label key={o.value} className="flex items-center gap-2 text-sm py-1 px-1 hover:bg-gray-50 rounded cursor-pointer">
            <input
              type="checkbox"
              checked={(selected || []).includes(o.value)}
              onChange={() => onToggle(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  );
}
