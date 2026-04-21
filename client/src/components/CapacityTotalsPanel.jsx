const TYPE_LABELS = {
  vacation: 'Vacation',
  holiday: 'Holiday',
  sick: 'Sick',
  loaned: 'Loaned',
  other: 'Other',
};

const TYPE_BAR_COLORS = {
  vacation: 'bg-blue-500',
  holiday: 'bg-gray-400',
  sick: 'bg-orange-500',
  loaned: 'bg-purple-500',
  other: 'bg-slate-400',
};

export default function CapacityTotalsPanel({ plan }) {
  const t = plan.team_totals;
  const delta = t.planned_hours - t.actual_hours;
  const deltaPct = t.planned_hours > 0 ? (delta / t.planned_hours) * 100 : 0;
  const deltaClass =
    deltaPct > 10 ? 'text-red-600'
      : deltaPct > 5 ? 'text-amber-600'
        : 'text-green-600';

  const breakdownEntries = Object.entries(plan.leave_breakdown).filter(([, h]) => h > 0);
  const maxBreakdownHours = Math.max(...Object.values(plan.leave_breakdown), 1);
  const loanEntries = Object.entries(plan.loan_by_team);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Capacity</h3>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Planned hours</span>
            <span className="font-medium tabular-nums">{t.planned_hours}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Actual hours</span>
            <span className="font-medium tabular-nums">{t.actual_hours}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total points</span>
            <span className="font-medium tabular-nums">{t.points}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Required allocation</span>
            <span className="font-medium tabular-nums">{t.required_allocation}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
            <span className="text-gray-600">Utilization</span>
            <span className="font-medium tabular-nums">{t.utilization_pct}%</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Planned vs Actual</h3>
        <div className="flex items-end gap-4">
          <div>
            <p className="text-xs text-gray-500">Planned</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{t.planned_hours}h</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Actual</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{t.actual_hours}h</p>
          </div>
          <div className={`ml-auto ${deltaClass}`}>
            <p className="text-xs">Delta</p>
            <p className="text-xl font-bold tabular-nums">−{delta}h</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          {delta === 0
            ? 'No unplanned leave'
            : `${deltaPct.toFixed(1)}% lost to unplanned leave`}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Leave breakdown</h3>
        {breakdownEntries.length === 0 ? (
          <p className="text-sm text-gray-400">No leave recorded.</p>
        ) : (
          <div className="space-y-2">
            {breakdownEntries.map(([type, hours]) => (
              <div key={type}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-gray-700">{TYPE_LABELS[type]}</span>
                  <span className="text-gray-600 tabular-nums">{hours}h</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${TYPE_BAR_COLORS[type]}`}
                    style={{ width: `${(hours / maxBreakdownHours) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {loanEntries.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Loans by destination team</p>
            {loanEntries.map(([team, hours]) => (
              <div key={team} className="flex justify-between text-xs">
                <span className="text-gray-700">→ {team}</span>
                <span className="text-gray-600 tabular-nums">{hours}h</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
