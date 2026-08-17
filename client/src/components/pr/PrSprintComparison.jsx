export default function PrSprintComparison({ rows }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        Sprint comparison
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          No sprint-attributed pull requests in this scope.
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
              <th className="text-left py-1 px-2">Sprint</th>
              <th className="text-left py-1 px-2">Merged</th>
              <th className="text-left py-1 px-2">Open</th>
              <th className="text-left py-1 px-2">Closed</th>
              <th className="text-left py-1 px-2">Stale</th>
              <th className="text-left py-1 px-2">Median merge</th>
              <th className="text-left py-1 px-2">Mix</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const closed = row.closed || 0;
              const total = row.merged + row.open + closed || 1;
              return (
                <tr key={row.sprint} className="border-b border-gray-100">
                  <td className="py-1.5 px-2 font-medium">{row.sprint}</td>
                  <td className="py-1.5 px-2">{row.merged}</td>
                  <td className="py-1.5 px-2">{row.open}</td>
                  <td className="py-1.5 px-2">{closed}</td>
                  <td className={`py-1.5 px-2 ${row.stale ? 'text-amber-700 font-semibold' : ''}`}>
                    {row.stale}
                  </td>
                  <td className="py-1.5 px-2">
                    {row.median_merge_days === null ? '—' : `${row.median_merge_days}d`}
                  </td>
                  <td className="py-1.5 px-2">
                    <div
                      className="flex h-3 w-28 rounded overflow-hidden"
                      role="img"
                      aria-label={`${row.merged} merged, ${row.open} open, ${closed} closed without merge`}
                    >
                      <div className="bg-green-600" style={{ width: `${(row.merged / total) * 100}%` }} />
                      <div className="bg-amber-500" style={{ width: `${(row.open / total) * 100}%` }} />
                      <div className="bg-gray-400" style={{ width: `${(closed / total) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
