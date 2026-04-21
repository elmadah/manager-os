import { useState, useMemo, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import api from '../lib/api';
import CapacityCellPopover from './CapacityCellPopover';

const TYPE_COLORS = {
  vacation: 'bg-blue-500',
  holiday: 'bg-gray-400',
  sick: 'bg-orange-500',
  loaned: 'bg-purple-500',
  other: 'bg-slate-400',
};

function listWeekdays(start, end) {
  if (!start || !end) return [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const out = [];
  const c = new Date(s);
  while (c <= e) {
    const d = c.getUTCDay();
    if (d !== 0 && d !== 6) {
      const y = c.getUTCFullYear();
      const m = String(c.getUTCMonth() + 1).padStart(2, '0');
      const day = String(c.getUTCDate()).padStart(2, '0');
      out.push(`${y}-${m}-${day}`);
    }
    c.setUTCDate(c.getUTCDate() + 1);
  }
  return out;
}

function formatCol(d) {
  const date = new Date(`${d}T00:00:00Z`);
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getUTCDay()];
  return `${dow} ${date.getUTCDate()}`;
}

export default function CapacityGrid({ plan, onChange }) {
  const [editing, setEditing] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    api.get('/teams').then(setTeams).catch(() => setTeams([]));
    api.get('/projects').then(setProjects).catch(() => setProjects([]));
  }, []);

  const dates = useMemo(() => listWeekdays(plan.start_date, plan.end_date), [plan.start_date, plan.end_date]);

  const leaveByKey = useMemo(() => {
    const map = new Map();
    for (const l of plan.leave) {
      map.set(`${l.member_id}:${l.leave_date}`, l);
    }
    return map;
  }, [plan.leave]);

  const activeMembers = plan.members.filter((m) => !m.is_excluded);
  const memberTotalsById = new Map(plan.member_totals.map((m) => [m.member_id, m]));

  async function excludeMember(memberId) {
    const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/capacity-plans/${plan.id}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_excluded: true }),
    });
    if (res.ok) onChange();
    setMenuOpen(null);
  }

  if (dates.length === 0) return null;

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-3 py-2 sticky left-0 bg-white z-10 min-w-[200px]">Member</th>
              {dates.map((d) => (
                <th key={d} className="px-2 py-2 font-medium text-xs text-gray-600 text-center min-w-[56px]">
                  {formatCol(d)}
                </th>
              ))}
              <th className="px-3 py-2 text-xs text-gray-600 text-right min-w-[100px]">Hours</th>
              <th className="px-3 py-2 text-xs text-gray-600 text-right min-w-[60px]">Pts</th>
              <th className="px-3 py-2 text-xs text-gray-600 text-right min-w-[60px]">Req</th>
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((m) => {
              const totals = memberTotalsById.get(m.member_id) || {};
              return (
                <tr key={m.member_id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-3 py-2 sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                      {m.color && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: m.color }}
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{m.member_name}</p>
                        {m.role && <p className="text-xs text-gray-500">{m.role}</p>}
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => setMenuOpen(menuOpen === m.member_id ? null : m.member_id)}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {menuOpen === m.member_id && (
                          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-44">
                            <button
                              onClick={() => excludeMember(m.member_id)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              Exclude from plan
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {dates.map((d) => {
                    const entry = leaveByKey.get(`${m.member_id}:${d}`);
                    const color = entry ? TYPE_COLORS[entry.leave_type] : '';
                    const unplanned = entry && entry.is_planned === 0;
                    return (
                      <td key={d} className="px-1 py-1 text-center">
                        <button
                          onClick={() => setEditing({ memberId: m.member_id, date: d, existing: entry })}
                          title={entry
                            ? `${entry.leave_type}${unplanned ? ' (unplanned)' : ''}${entry.loan_note ? ` — ${entry.loan_note}` : ''}`
                            : 'Present — click to add leave'}
                          className={`w-8 h-8 rounded ${entry ? color : 'bg-gray-100 hover:bg-gray-200'} ${unplanned ? 'ring-2 ring-offset-1 ring-red-400' : ''}`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="text-gray-900 font-medium">{totals.actual_hours ?? 0}</span>
                    {totals.planned_hours !== totals.actual_hours && (
                      <span className="text-xs text-gray-400 ml-1">/ {totals.planned_hours}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{totals.points ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{totals.required_allocation ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <CapacityCellPopover
          planId={plan.id}
          memberId={editing.memberId}
          date={editing.date}
          existing={editing.existing}
          teams={teams}
          projects={projects}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChange(); }}
        />
      )}
    </>
  );
}
