export default function PrReadinessPanel({ summary, scopeLabel }) {
  const { merged, open, stale, closed, total, storiesWithoutMergedPr } = summary;
  const pct = (n) => (total ? `${(n / total) * 100}%` : '0%');
  const hasStoriesWithoutMergedPr = storiesWithoutMergedPr.length > 0;

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        Readiness — {scopeLabel}
      </div>

      <div className="flex items-center gap-6 flex-wrap">
        {total === 0 ? (
          <p className="text-sm text-gray-500 flex-1 min-w-[220px]">
            No pull requests in this scope.
          </p>
        ) : (
          <div className="flex-1 min-w-[220px]">
            <div
              className="flex h-4 rounded overflow-hidden"
              role="img"
              aria-label={`${merged} merged, ${open} open (${stale} stale), ${closed} closed without merge, out of ${total} total pull requests`}
            >
              <div className="bg-green-600" style={{ width: pct(merged) }} />
              <div className="bg-amber-500" style={{ width: pct(open - stale) }} />
              <div className="bg-red-600" style={{ width: pct(stale) }} />
              <div className="bg-gray-400" style={{ width: pct(closed) }} />
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              {merged} merged · {open} open · {stale} stale &gt;3d without review · {closed} closed without merge
            </div>
          </div>
        )}

        <div className="text-xs">
          {!hasStoriesWithoutMergedPr ? (
            <span className="text-green-700 font-medium">
              Every story has a merged PR
            </span>
          ) : (
            <>
              <div className="text-amber-700 font-semibold">
                {storiesWithoutMergedPr.length}{' '}
                {storiesWithoutMergedPr.length === 1 ? 'story has' : 'stories have'} no merged PR
              </div>
              <div className="text-gray-500">
                {storiesWithoutMergedPr.slice(0, 8).map((s) => s.key).join(', ')}
                {storiesWithoutMergedPr.length > 8 &&
                  ` +${storiesWithoutMergedPr.length - 8} more`}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
