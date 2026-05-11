import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  monthTicks,
  quarterTicks,
  computeBarPosition,
  todayPercent,
  healthOfFeature,
  HEALTH_BAR_COLORS,
} from '../lib/roadmap';
import Bar from './RoadmapBar';

const HEALTH_DOT = { green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500' };

function formatRange(start, target) {
  const fmt = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} → ${fmt(target)}`;
}

function projectTooltip(p) {
  const s = p.story_stats || {};
  return `${p.name}\n${formatRange(p.start_date, p.target_date)}\n${s.completed}/${s.total} stories · ${s.completed_points}/${s.total_points} pts`;
}

function featureTooltip(f) {
  const s = f.story_stats || {};
  return `${f.name}\n${formatRange(f.start_date, f.target_date)}\n${s.completed}/${s.total} stories · ${s.completed_points}/${s.total_points} pts`;
}

export default function RoadmapGantt({ projects, rangeStart, rangeEnd, showQuarterBand }) {
  const navigate = useNavigate();
  const months = useMemo(() => monthTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const quarters = useMemo(() => quarterTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const todayPct = useMemo(() => todayPercent(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  if (projects.length === 0) {
    return <div className="text-sm text-gray-400 py-8 text-center">No projects in this range.</div>;
  }

  return (
    <div className="relative border border-gray-200 rounded-lg overflow-hidden bg-white">
      {showQuarterBand && (
        <div className="grid border-b border-gray-200 bg-indigo-50" style={{ gridTemplateColumns: '220px 1fr' }}>
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Quarter</div>
          <div className="relative h-6">
            {quarters.map((q, i) => (
              <div
                key={i}
                className="absolute inset-y-0 border-l border-indigo-200 px-2 text-[11px] font-semibold text-indigo-700 flex items-center"
                style={{ left: `${q.leftPct}%`, width: `${q.widthPct}%` }}
              >
                {q.label}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid border-b border-gray-200 bg-gray-50" style={{ gridTemplateColumns: '220px 1fr' }}>
        <div className="px-3 py-1.5 text-xs text-gray-500">Project / Feature</div>
        <div className="relative h-6">
          {months.map((m, i) => {
            const isQuarterStart = m.month % 3 === 0;
            return (
              <div
                key={i}
                className="absolute inset-y-0 px-1.5 text-[11px] text-gray-500 flex items-center"
                style={{
                  left: `${m.leftPct}%`,
                  width: `${m.widthPct}%`,
                  borderLeft: isQuarterStart ? '1px solid #c7d2fe' : '1px dashed #f1f5f9',
                }}
              >
                {m.label}
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative">
        {projects.map(p => (
          <ProjectGroup
            key={p.id}
            project={p}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onProjectClick={() => navigate(`/projects/${p.id}`)}
            onFeatureClick={() => navigate(`/projects/${p.id}`)}
          />
        ))}

        {todayPct !== null && (
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 pointer-events-none"
            style={{ left: `calc(220px + ${todayPct}%)` }}
          >
            <div className="absolute -top-5 -translate-x-1/2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded">
              Today
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectGroup({ project, rangeStart, rangeEnd, onProjectClick, onFeatureClick }) {
  const projectPosition = useMemo(
    () => computeBarPosition({ start: project.start_date, target: project.target_date, rangeStart, rangeEnd }),
    [project.start_date, project.target_date, rangeStart, rangeEnd]
  );

  return (
    <>
      <div className="grid bg-slate-50/60 border-b border-gray-100" style={{ gridTemplateColumns: '220px 1fr' }}>
        <div className="px-3 py-2 flex items-center gap-2 border-r border-gray-100">
          <span className={`w-2 h-2 rounded-full ${HEALTH_DOT[project.health] || HEALTH_DOT.green}`} />
          <span className="font-semibold text-sm text-gray-800 truncate">{project.name}</span>
        </div>
        <div className="relative h-9">
          <GridLines rangeStart={rangeStart} rangeEnd={rangeEnd} />
          <Bar
            position={projectPosition}
            color={project.color || '#3b82f6'}
            label={project.name}
            kind="project"
            tooltip={projectTooltip(project)}
            onClick={onProjectClick}
          />
        </div>
      </div>

      {project.features.map(f => {
        const pos = computeBarPosition({ start: f.start_date, target: f.target_date, rangeStart, rangeEnd });
        const health = healthOfFeature(f);
        return (
          <div key={f.id} className="grid border-b border-gray-50" style={{ gridTemplateColumns: '220px 1fr' }}>
            <div className="pl-8 pr-3 py-2 text-sm text-gray-500 border-r border-gray-100 truncate">{f.name}</div>
            <div className="relative h-9">
              <GridLines rangeStart={rangeStart} rangeEnd={rangeEnd} />
              <Bar
                position={pos}
                color={HEALTH_BAR_COLORS[health]}
                label={f.name}
                kind="feature"
                tooltip={featureTooltip(f)}
                onClick={onFeatureClick}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

function GridLines({ rangeStart, rangeEnd }) {
  const months = useMemo(() => monthTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  return (
    <div className="absolute inset-0 pointer-events-none">
      {months.map((m, i) => {
        const isQuarterStart = m.month % 3 === 0;
        return (
          <div
            key={i}
            className="absolute inset-y-0"
            style={{
              left: `${m.leftPct}%`,
              borderLeft: isQuarterStart ? '1px solid #e0e7ff' : '1px dashed #f1f5f9',
            }}
          />
        );
      })}
    </div>
  );
}
