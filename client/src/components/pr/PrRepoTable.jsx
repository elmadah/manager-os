export default function PrRepoTable({ rows, onSelectRepo, activeRepoId }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        Repositories
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
            <th className="text-left py-1 px-2">Repo</th>
            <th className="text-left py-1 px-2">Open</th>
            <th className="text-left py-1 px-2">Merged</th>
            <th className="text-left py-1 px-2">Stale</th>
            <th className="text-left py-1 px-2">Oldest open</th>
            <th className="text-left py-1 px-2">Median merge</th>
            <th className="text-left py-1 px-2">Sync</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const failed = !!row.last_sync_error;
            // Whether the repo has no data must be judged from the unfiltered
            // total (row.total_prs, independent of every dashboard filter),
            // never from the filtered counts. A repo with plenty of PRs and a
            // stale sync error, viewed under a filter that happens to exclude
            // all of that repo's PRs, must still render its true (zero)
            // filtered counts as amber "Stale" — not red "Failed" with dashes,
            // which would falsely claim the data itself is missing.
            const hasNoData = !row.total_prs;
            const errorNoData = failed && hasNoData;
            const errorStale = failed && !hasNoData;
            const isActive = activeRepoId === String(row.id);
            const syncStateLabel = errorNoData
              ? 'last sync failed, no data available'
              : errorStale
                ? 'last sync failed, showing last known data'
                : 'sync ok';
            return (
              <tr
                key={row.id}
                onClick={() => onSelectRepo(row.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectRepo(row.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-pressed={isActive}
                aria-label={`${row.slug}${isActive ? ' (active filter)' : ''} — ${syncStateLabel}`}
                className={`border-b border-gray-100 cursor-pointer focus:outline focus:outline-2 focus:outline-blue-400 focus:-outline-offset-2 ${
                  errorNoData
                    ? 'bg-red-50'
                    : errorStale
                      ? 'bg-amber-50'
                      : isActive
                        ? 'bg-blue-50'
                        : 'hover:bg-gray-50'
                } ${isActive ? 'ring-1 ring-inset ring-blue-400' : ''}`}
              >
                <td className="py-1.5 px-2">
                  {isActive && <span className="text-blue-600 font-semibold mr-1">▸</span>}
                  <span className="font-medium">{row.slug}</span>
                  <span className="text-gray-400"> · {row.project_name || 'unmapped'}</span>
                </td>
                {/* A repo that failed to sync AND has no data shows dashes, never
                    zeros — no data is not the same as no PRs, and zeros would read
                    as a quiet week. A repo with a failed sync but real last-known
                    data shows its true counts (see errorStale styling on Sync). */}
                <td className="py-1.5 px-2">{errorNoData ? '—' : row.open}</td>
                <td className="py-1.5 px-2">{errorNoData ? '—' : row.merged}</td>
                <td className={`py-1.5 px-2 ${!errorNoData && row.stale ? 'text-amber-700 font-semibold' : ''}`}>
                  {errorNoData ? '—' : row.stale}
                </td>
                <td className="py-1.5 px-2">
                  {errorNoData || row.oldest_open_days === null ? '—' : `${row.oldest_open_days}d`}
                </td>
                <td className="py-1.5 px-2">
                  {errorNoData || row.median_merge_days === null ? '—' : `${row.median_merge_days}d`}
                </td>
                <td className="py-1.5 px-2">
                  {errorNoData ? (
                    <span className="text-red-600 font-semibold" title={row.last_sync_error}>
                      Failed
                    </span>
                  ) : errorStale ? (
                    <span className="text-amber-700 font-semibold" title={row.last_sync_error}>
                      Stale
                    </span>
                  ) : (
                    <span className="text-green-700 font-semibold">OK</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-[10px] text-gray-400 mt-2">
        Always shows true counts for every active repo. Click a row to filter the page to that repo.
      </p>
    </div>
  );
}
