const COLUMNS = [
  { key: 'number', label: 'PR' },
  { key: null, label: 'Repo' },
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: null, label: 'Story' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'state', label: 'State' },
  { key: 'size', label: 'Size' },
];

function StateCell({ row }) {
  if (row.state === 'merged') return <span className="text-green-700 font-semibold">Merged</span>;
  if (row.state === 'closed') return <span className="text-gray-400">Closed</span>;
  const days = Math.round((Date.now() - new Date(row.pr_created_at).getTime()) / 86400000);
  return (
    <span className={row.is_stale ? 'text-amber-700 font-semibold' : 'text-gray-600'}>
      Open {days}d{row.is_stale ? ' · stale' : ''}
    </span>
  );
}

export default function PrTable({ rows, total, sort, dir, onSort }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        Pull requests
        <span className="normal-case tracking-normal text-gray-400">
          {' '}— {total} result{total === 1 ? '' : 's'}, row opens GitHub
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No pull requests match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
                {COLUMNS.map((col) => {
                  const isSorted = sort === col.key;
                  const ariaSort = !col.key ? undefined : isSorted ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
                  return (
                    <th key={col.label} className="text-left py-1 px-2" aria-sort={ariaSort}>
                      {col.key ? (
                        <button
                          type="button"
                          onClick={() => onSort(col.key)}
                          className="flex items-center gap-1 uppercase tracking-wide text-[10px] text-gray-400 hover:text-gray-600 focus:outline focus:outline-2 focus:outline-blue-400 focus:-outline-offset-2"
                        >
                          {col.label}
                          {isSorted && (
                            <>
                              <span aria-hidden="true">{dir === 'asc' ? '▲' : '▼'}</span>
                              <span className="sr-only">
                                , sorted {dir === 'asc' ? 'ascending' : 'descending'}
                              </span>
                            </>
                          )}
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => window.open(row.url, '_blank', 'noopener')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      window.open(row.url, '_blank', 'noopener');
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`PR #${row.number}: ${row.title} — opens on GitHub in a new tab`}
                  className="border-b border-gray-100 cursor-pointer hover:bg-gray-50 focus:outline focus:outline-2 focus:outline-blue-400 focus:-outline-offset-2"
                >
                  <td className="py-1.5 px-2">#{row.number}</td>
                  <td className="py-1.5 px-2 text-gray-500">{row.repo_slug}</td>
                  <td className="py-1.5 px-2">{row.title}</td>
                  <td className="py-1.5 px-2">
                    {row.author_name || row.author_login || '—'}
                  </td>
                  {/* An explicit dash, not a blank — "no Jira key" is information. */}
                  <td className="py-1.5 px-2">
                    {row.jira_key || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-1.5 px-2">
                    {row.sprint || <span className="text-gray-300">—</span>}
                    {row.sprint_source === 'date_window' && (
                      <span className="text-gray-400" title="Attributed by merge date, not a linked story">
                        {' '}(date)
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2"><StateCell row={row} /></td>
                  <td className="py-1.5 px-2 text-gray-500">
                    +{row.additions}/-{row.deletions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
