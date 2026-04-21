import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from './ToastProvider';

const LEAVE_TYPES = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'sick', label: 'Sick' },
  { value: 'loaned', label: 'Loaned' },
  { value: 'other', label: 'Other' },
];

export default function AddLeaveRangeModal({ isOpen, onClose, onSaved, plan, teams, projects }) {
  const toast = useToast();
  const [memberId, setMemberId] = useState('');
  const [startDate, setStartDate] = useState(plan?.start_date || '');
  const [endDate, setEndDate] = useState(plan?.start_date || '');
  const [leaveType, setLeaveType] = useState('vacation');
  const [isPlanned, setIsPlanned] = useState(true);
  const [loanTeamId, setLoanTeamId] = useState('');
  const [loanProjectId, setLoanProjectId] = useState('');
  const [loanNote, setLoanNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !plan) return;
    setMemberId('');
    setStartDate(plan.start_date);
    setEndDate(plan.start_date);
    setLeaveType('vacation');
    setIsPlanned(true);
    setLoanTeamId('');
    setLoanProjectId('');
    setLoanNote('');
    setError(null);
  }, [isOpen, plan]);

  if (!isOpen || !plan) return null;

  const activeMembers = plan.members.filter((m) => !m.is_excluded);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post(`/capacity-plans/${plan.id}/leave/range`, {
        member_id: Number(memberId),
        start_date: startDate,
        end_date: endDate,
        leave_type: leaveType,
        is_planned: isPlanned,
        loan_team_id: loanTeamId ? Number(loanTeamId) : null,
        loan_project_id: loanProjectId ? Number(loanProjectId) : null,
        loan_note: loanNote || null,
      });
      toast.success(`Applied to ${result.applied_days} day(s)`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.data?.error || 'Failed to apply range');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add leave range</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Member</label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select…</option>
              {activeMembers.map((m) => {
                const label = m.member_name || m.name;
                return <option key={m.member_id} value={m.member_id}>{label}</option>;
              })}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input
                type="date"
                value={startDate}
                min={plan.start_date}
                max={plan.end_date}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
              <input
                type="date"
                value={endDate}
                min={plan.start_date}
                max={plan.end_date}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
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
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isPlanned} onChange={(e) => setIsPlanned(e.target.checked)} />
            Planned (booked before sprint started)
          </label>

          {leaveType === 'loaned' && (
            <div className="space-y-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Loaned to team</label>
                <select
                  value={loanTeamId}
                  onChange={(e) => setLoanTeamId(e.target.value)}
                  required
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2 disabled:opacity-50">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Apply range
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
