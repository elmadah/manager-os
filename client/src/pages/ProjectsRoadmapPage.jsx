import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { defaultRange, healthOfFeature } from '../lib/roadmap';
import RoadmapToolbar from '../components/RoadmapToolbar';
import RoadmapGantt from '../components/RoadmapGantt';
import UnscheduledList from '../components/UnscheduledList';

function parseList(v) {
  if (!v) return [];
  return v.split(',').filter(Boolean);
}

function deriveProjectHealthBucket(p) {
  return p.health || 'green';
}

export default function ProjectsRoadmapPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const fallback = defaultRange(new Date());
    return {
      start: searchParams.get('start') || fallback.start,
      end: searchParams.get('end') || fallback.end,
      preset: searchParams.get('preset') || '12m',
      status: parseList(searchParams.get('status')),
      health: parseList(searchParams.get('health')),
    };
  }, [searchParams]);

  function setParams(next) {
    const sp = new URLSearchParams();
    sp.set('start', next.start);
    sp.set('end', next.end);
    if (next.preset && next.preset !== '12m') sp.set('preset', next.preset);
    if (next.status?.length) sp.set('status', next.status.join(','));
    if (next.health?.length) sp.set('health', next.health.join(','));
    setSearchParams(sp, { replace: true });
  }

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/projects/roadmap?start=${params.start}&end=${params.end}`)
      .then(d => { if (!cancelled) { setData(d); setError(null); } })
      .catch(err => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params.start, params.end]);

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    return data.projects.filter(p => {
      if (params.status.length && !params.status.includes(p.status)) return false;
      if (params.health.length && !params.health.includes(deriveProjectHealthBucket(p))) return false;
      return true;
    }).map(p => ({
      ...p,
      features: params.health.length
        ? p.features.filter(f => params.health.includes(healthOfFeature(f)))
        : p.features,
    }));
  }, [data, params.status, params.health]);

  return (
    <div className="h-full flex flex-col">
      <RoadmapToolbar params={params} setParams={setParams} />

      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-3">
        <Legend swatch="#3b82f6" label="Project span" />
        <Legend swatch="#10b981" label="Feature (on track)" />
        <Legend swatch="#f59e0b" label="Feature (at risk)" />
        <Legend swatch="#ef4444" label="Feature (off track)" />
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-[2px] h-3 bg-red-500" /> Today</span>
      </div>

      {loading && <div className="text-sm text-gray-400">Loading…</div>}
      {error && <div className="text-sm text-red-600">Failed to load roadmap: {error.message}</div>}

      {data && !loading && (
        <>
          <RoadmapGantt
            projects={filteredProjects}
            rangeStart={params.start}
            rangeEnd={params.end}
            showQuarterBand={params.preset === '12m' || !params.preset}
          />
          <UnscheduledList unscheduled={data.unscheduled} />
        </>
      )}
    </div>
  );
}

function Legend({ swatch, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: swatch }} />
      {label}
    </span>
  );
}
