import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import usePrFilters from '../hooks/usePrFilters';

const STALE_SYNC_MS = 30 * 60 * 1000;

export default function PullRequestsPage() {
  const { filters, setFilter, toggleArrayValue, clearAll, queryString } = usePrFilters();
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const autoSyncedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = queryString ? `?${queryString}` : '';
      const [list, summary, bySprint, byRepo, byAuthor, filterOptions] = await Promise.all([
        api.get(`/pull-requests${qs}`),
        api.get(`/pull-requests/summary${qs}`),
        api.get(`/pull-requests/by-sprint${qs}`),
        api.get(`/pull-requests/by-repo${qs}`),
        api.get(`/pull-requests/by-author${qs}`),
        api.get('/pull-requests/filters'),
      ]);
      setData({ list, summary, bySprint, byRepo, byAuthor });
      setOptions(filterOptions);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      await api.post('/settings/github/sync');
      await load();
    } catch {
      // A failed sync leaves cached data on screen; the repo table shows why.
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

      {/* Task 10 renders PrFilterBar here */}
      {/* Task 11 renders PrReadinessPanel / PrSprintComparison here */}
      {/* Task 12 renders PrRepoTable and PrContributorTable here */}
      {/* Task 13 renders PrTrendChart and PrTable here */}

      <pre className="text-xs bg-gray-50 p-3 rounded border overflow-auto">
        {JSON.stringify({ filters, syncing, counts: data && data.summary }, null, 2)}
      </pre>
    </div>
  );
}
