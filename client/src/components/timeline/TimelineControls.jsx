import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const VIEW_OPTIONS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export default function TimelineControls({ dateRange, view, onViewChange, onPrev, onNext, onToday }) {
  const formatRange = () => {
    const start = new Date(dateRange.start + 'T00:00:00');
    const end = new Date(dateRange.end + 'T00:00:00');
    const opts = { month: 'short', day: 'numeric' };
    const startStr = start.toLocaleDateString('en-US', opts);
    const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
    return `${startStr} - ${endStr}`;
  };

  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-bold text-gray-900">Project Timeline</h2>
      <div className="flex items-center gap-3">
        <button
          onClick={onToday}
          className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Today
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={onNext}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700">
          <Calendar size={14} />
          {formatRange()}
        </div>
        <div className="flex bg-white border border-gray-300 rounded-lg overflow-hidden">
          {VIEW_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onViewChange(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                view === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
