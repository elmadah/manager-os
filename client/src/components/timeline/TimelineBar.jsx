import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getBarPosition(startDate, endDate, rangeStart, rangeDays) {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const rStart = new Date(rangeStart + 'T00:00:00');

  const startOffset = (start - rStart) / (1000 * 60 * 60 * 24);
  const duration = (end - start) / (1000 * 60 * 60 * 24) + 1;

  const left = (startOffset / rangeDays) * 100;
  const width = (duration / rangeDays) * 100;

  return {
    left: `${Math.max(left, 0)}%`,
    width: `${Math.min(width, 100 - Math.max(left, 0))}%`,
  };
}

export function ProjectBar({ project, rangeStart, rangeDays, expanded, onToggle }) {
  const color = project.color || '#3B82F6';
  const pos = getBarPosition(
    project.start_date,
    project.target_date,
    rangeStart,
    rangeDays
  );

  return (
    <div
      className="absolute h-8 rounded-md flex items-center gap-1.5 px-2 cursor-pointer transition-all hover:shadow-md group"
      style={{
        left: pos.left,
        width: pos.width,
        backgroundColor: hexToRgba(color, 0.15),
        borderLeft: `3px solid ${color}`,
        top: '4px',
      }}
      onClick={onToggle}
      title={`${project.name} (${project.start_date} → ${project.target_date})`}
    >
      {expanded ? (
        <ChevronDown size={12} className="shrink-0 text-gray-500" />
      ) : (
        <ChevronRight size={12} className="shrink-0 text-gray-500" />
      )}
      <span className="text-xs font-medium truncate" style={{ color }}>
        {project.name}
      </span>
    </div>
  );
}

export function FeatureBar({ feature, color, rangeStart, rangeDays, rowIndex }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const pos = getBarPosition(
    feature.start_date,
    feature.target_date,
    rangeStart,
    rangeDays
  );

  const statusColors = {
    not_started: 'bg-gray-300',
    in_progress: 'bg-blue-400',
    complete: 'bg-green-400',
  };

  return (
    <div
      className="absolute h-7 rounded-md flex items-center gap-1.5 px-2 transition-all hover:shadow-md"
      style={{
        left: pos.left,
        width: pos.width,
        backgroundColor: hexToRgba(color, 0.2),
        borderLeft: `3px solid ${color}`,
        top: `${rowIndex * 36 + 4}px`,
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColors[feature.status] || 'bg-gray-300'}`} />
      <span className="text-xs font-medium text-gray-700 truncate">
        {feature.name}
      </span>
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap pointer-events-none">
          <div className="font-semibold">{feature.name}</div>
          <div className="text-gray-300 mt-0.5">{feature.start_date} → {feature.target_date}</div>
          {feature.assignees?.length > 0 && (
            <div className="text-gray-300 mt-0.5">
              {feature.assignees.map(a => a.name).join(', ')}
            </div>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
        </div>
      )}
    </div>
  );
}

export { getBarPosition };
