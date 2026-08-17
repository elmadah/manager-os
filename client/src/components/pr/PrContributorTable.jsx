export default function PrContributorTable({ rows }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        Contributors
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No contributors in this scope.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
              <th className="text-left py-1 px-2">Person</th>
              <th className="text-left py-1 px-2">Authored</th>
              <th className="text-left py-1 px-2">Reviews</th>
              <th className="text-left py-1 px-2">Median size</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              // Keyed by member_id when mapped; otherwise by row position.
              // The server already dedupes truly distinct people by login,
              // but two different unmapped contributors can both surface
              // with no login and the same fallback display name ('unknown'),
              // so `row.name` alone is not unique. `index` is stable here
              // because rows is a fresh, non-reordered array from the server
              // on every render — it isn't reconciling against a mutating list.
              <tr key={row.member_id ? `m${row.member_id}` : `row-${index}`} className="border-b border-gray-100">
                <td className="py-1.5 px-2">
                  {row.name}
                  {/* Unmapped GitHub logins stay visible rather than being dropped. */}
                  {!row.member_id && (
                    <span className="text-gray-400" title="No matching team member — set their GitHub login in Team">
                      {' '}· unmapped
                    </span>
                  )}
                </td>
                <td className="py-1.5 px-2">{row.authored}</td>
                <td className="py-1.5 px-2">{row.reviews_given}</td>
                <td className="py-1.5 px-2">
                  {row.median_size === null ? '—' : `+${row.median_size}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
