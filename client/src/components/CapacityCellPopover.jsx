import { useState, useEffect } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import api from '../lib/api';

const LEAVE_TYPES = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'sick', label: 'Sick' },
  { value: 'loaned', label: 'Loaned' },
  { value: 'other', label: 'Other' },
];

export default function CapacityCellPopover({
  planId,
  memberId,
  date,
  existing,
  teams,
  projects,
  onClose,
  onSaved,
}) {
  const [leaveType, setLeaveType] = useState(existing?.leave_type || 'vacation');
  const [isPlanned, setIsPlanned] = useState(existing ? existing.is_planned === 1 : true);
  const [loanTeamId, setLoanTeamId] = useState(existing?.loan_team_id || '');
  const [loanProjectId, setLoanProjectId] = useState(existing?.loan_project_id || '');
  const [loanNote, setLoanNote] = useState(existing?.loan_note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/capacity-plans/${planId}/leave`, {
        member_id: memberId,
        leave_date: date,
        leave_type: leaveType,
        is_planned: isPlanned,
        loan_team_id: loanTeamId ? Number(loanTeamId) : null,
        loan_project_id: loanProjectId ? Number(loanProjectId) : null,
        loan_note: loanNote || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/capacity-plans/${planId}/leave`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, leave_date: date }),
      });
      if (!res.ok) throw new Error('Clear failed');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Clear failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-sm shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Leave entry</p>
          <p className="text-sm text-gray-900 font-medium">{date}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {LEAVE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="is-planned"
            type="checkbox"
            checked={isPlanned}
            onChange={(e) => setIsPlanned(e.target.checked)}
          />
          <label htmlFor="is-planned" className="text-sm text-gray-700">Planned (booked before sprint started)</label>
        </div>

        {leaveType === 'loaned' && (
          <div className="space-y-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Loaned to team</label>
              <select
                value={loanTeamId}
                onChange={(e) => setLoanTeamId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Select…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Project (optional)</label>
              <select
                value={loanProjectId}
                onChange={(e) => setLoanProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
              <input
                type="text"
                value={loanNote}
                onChange={(e) => setLoanNote(e.target.value)}
                placeholder="e.g. covering for Sarah"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="flex items-center justify-between pt-1">
          {existing ? (
            <button
              onClick={handleClear}
              disabled={saving}
              className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Clear
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (leaveType === 'loaned' && !loanTeamId)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
