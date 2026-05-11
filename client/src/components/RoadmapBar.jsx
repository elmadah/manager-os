import { useState } from 'react';

export default function RoadmapBar({ position, color, label, kind, tooltip, onClick }) {
  const [hover, setHover] = useState(false);
  if (!position) return null;

  const heightClass = kind === 'project' ? 'h-3' : 'h-[18px]';
  const topClass = kind === 'project' ? 'top-[11px]' : 'top-2';
  const clipLeft = position.clippedStart ? 'rounded-l-none' : 'rounded-l';
  const clipRight = position.clippedEnd ? 'rounded-r-none' : 'rounded-r';

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`absolute ${topClass} ${heightClass} ${clipLeft} ${clipRight} text-white text-[11px] leading-[18px] px-2 truncate cursor-pointer shadow-sm hover:brightness-110`}
      style={{
        left: `${position.leftPct}%`,
        width: `${position.widthPct}%`,
        backgroundColor: color,
        opacity: kind === 'project' ? 0.75 : 1,
      }}
    >
      {kind === 'feature' && label}
      {hover && tooltip && (
        <div
          className="absolute z-20 bg-slate-900 text-slate-100 text-xs rounded-md px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap"
          style={{ top: 'calc(100% + 6px)', left: 0 }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}
