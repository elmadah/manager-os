import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import usePrFilters from '../hooks/usePrFilters';
import PrFilterBar from '../components/pr/PrFilterBar';

const STALE_SYNC_MS = 30 * 60 * 1000;

export default function PullRequestsPage() {
  const { filters, setFilter, toggleArrayValue, clearAll, queryString } = usePrFilters();
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [failedSections, setFailedSections] = useState([]);
  const autoSyncedRef = useRef(false);
  // Monotonically increasing request id. Each load() captures the id it was
  // issued at; when a response lands, we only apply it (and only clear the
  // loading flag) if no newer request has been issued in the meantime. This
  // stops a slow, now-stale response from overwriting the data for the
  // filters currently shown in the URL.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const qs = queryString ? `?${queryString}` : '';
    // /pull-requests/filters is load-bearing: without it there are no filter
    // options and no repo list, so its failure keeps the existing full-page
    // error behavior. The other five degrade to a safe empty default per
    // section so the page still renders with whatever succeeded.
    const sections = [
      { key: 'list', label: 'Pull requests', url: `/pull-requests${qs}`, fallback: { rows: [], total: 0 } },
      {
        key: 'summary',
        label: 'Summary',
        url: `/pull-requests/summary${qs}`,
        fallback: {
          total: 0,
          merged: 0,
          open: 0,
          closed: 0,
          stale: 0,
          isSingle: false,
          storiesWithoutMergedPr: [],
        },
      },
      { key: 'bySprint', label: 'Sprint comparison', url: `/pull-requests/by-sprint${qs}`, fallback: [] },
      { key: 'byRepo', label: 'Repositories', url: `/pull-requests/by-repo${qs}`, fallback: [] },
      { key: 'byAuthor', label: 'Contributors', url: `/pull-requests/by-author${qs}`, fallback: [] },
    ];

    const results = await Promise.allSettled([
      ...sections.map((section) => api.get(section.url)),
      api.get('/pull-requests/filters'),
    ]);

    // A newer load() has since been kicked off — this response is stale.
    // Ignore it entirely (including the loading flag) so it can't clobber
    // state for filters that are no longer current.
    if (requestIdRef.current !== requestId) return;

    const filtersResult = results[results.length - 1];
    if (filtersResult.status === 'rejected') {
      setError(filtersResult.reason);
      setLoading(false);
      return;
    }

    const newData = {};
    const failed = [];
    sections.forEach((section, i) => {
      const result = results[i];
      if (result.status === 'fulfilled') {
        newData[section.key] = result.value;
      } else {
        newData[section.key] = section.fallback;
        failed.push(section.label);
      }
    });

    setData(newData);
    setOptions(filtersResult.value);
    setFailedSections(failed);
    setLoading(false);
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      await api.post('/settings/github/sync');
      await load();
    } catch (err) {
      // A failed sync leaves cached data on screen; the repo table shows why.
      console.error('GitHub sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }, [load]);

  // Background refresh when data is stale. Renders cached data first, never blocks.
  useEffect(() => {
    if (!options || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    // github_settings.last_sync_at is written as strftime('%Y-%m-%dT%H:%M:%SZ','now'),
    // i.e. already a valid ISO-8601 UTC string ending in 'Z' — parse it directly.
    // If it's missing or unparseable, treat it as maximally stale (0) rather than
    // letting a bad value silently disable the background refresh.
    const parsed = options.lastSyncAt ? Date.parse(options.lastSyncAt) : NaN;
    const last = Number.isFinite(parsed) ? parsed : 0;
    if (Date.now() - last > STALE_SYNC_MS) runSync();
  }, [options, runSync]);

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">Pull Requests</h1>
        <p className="text-red-600">Failed to load pull requests: {error.message}</p>
      </div>
    );
  }

  if (!options) {
    return <div className="p-6 text-gray-500">Loading pull requests…</div>;
  }

  if (!options.repos.length) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">Pull Requests</h1>
        <p className="text-gray-500">
          No repositories are tracked yet. Add some in{' '}
          <a className="text-blue-600 hover:underline" href="/settings/github">
            Settings → GitHub
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pull Requests</h1>
        {loading && <span className="text-sm text-gray-400">Refreshing…</span>}
      </div>

      {failedSections.length > 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Couldn't load: {failedSections.join(', ')}. Showing zeros/empty for{' '}
          {failedSections.length === 1 ? 'that section' : 'those sections'} — try refreshing.
        </p>
      )}

      <PrFilterBar
        filters={filters}
        options={options}
        onSetFilter={setFilter}
        onToggle={toggleArrayValue}
        onClear={clearAll}
        onSync={runSync}
        syncing={syncing}
        lastSyncAt={options.lastSyncAt}
      />
      {/* Task 11 renders PrReadinessPanel / PrSprintComparison here */}
      {/* Task 12 renders PrRepoTable and PrContributorTable here */}
      {/* Task 13 renders PrTrendChart and PrTable here */}

      <pre className="text-xs bg-gray-50 p-3 rounded border overflow-auto">
        {JSON.stringify({ filters, syncing, counts: data && data.summary }, null, 2)}
      </pre>
    </div>
  );
}
