import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const DEFAULT_FILL = '#2563eb';
const SELECTED_FILL = '#1d4ed8';
const UNSELECTED_FILL = '#bfdbfe';
// Keeps a small trailing-window (or single-sprint) result from rendering as
// a handful of absurdly wide bars.
const MAX_BAR_SIZE = 48;

export default function PrTrendChart({ rows, selectedSprint }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">
        Merged per sprint
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing to chart in this scope.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="merged" fill={DEFAULT_FILL} radius={[3, 3, 0, 0]} maxBarSize={MAX_BAR_SIZE}>
                {selectedSprint &&
                  rows.map((row) => (
                    <Cell
                      key={row.sprint}
                      fill={row.sprint === selectedSprint ? SELECTED_FILL : UNSELECTED_FILL}
                    />
                  ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {selectedSprint && (
            <p className="text-[11px] text-gray-400 mt-1">
              Darker bar is the selected sprint ({selectedSprint}); the others show trailing
              sprints for comparison.
            </p>
          )}
        </>
      )}
    </div>
  );
}
