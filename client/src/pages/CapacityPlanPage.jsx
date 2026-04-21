import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ArrowLeft, Plus } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/ToastProvider';
import CapacityGrid from '../components/CapacityGrid';
import CapacityTotalsPanel from '../components/CapacityTotalsPanel';
import AddLeaveRangeModal from '../components/AddLeaveRangeModal';

export default function CapacityPlanPage() {
  const { id } = useParams();
  const toast = useToast();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    api.get('/teams').then(setTeams).catch(() => setTeams([]));
    api.get('/projects').then(setProjects).catch(() => setProjects([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/capacity-plans/${id}`);
      setPlan(data);
      setError(null);
    } catch (err) {
      setError(err.data?.error || 'Failed to load plan');
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function reincludeMember(memberId) {
    const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/capacity-plans/${id}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_excluded: false }),
    });
    if (res.ok) { toast.success('Re-included'); load(); }
  }

  async function saveField(field, value) {
    try {
      await api.put(`/capacity-plans/${id}`, { [field]: value });
      toast.success('Saved');
      load();
    } catch (err) {
      toast.error(err.data?.error || 'Failed to save');
      load();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div>
        <Link to="/capacity" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Capacity
        </Link>
        <p className="text-red-600">{error || 'Plan not found'}</p>
      </div>
    );
  }

  return (
    <div>
      <Link to="/capacity" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Capacity
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <input
              defaultValue={plan.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== plan.name) saveField('name', v);
              }}
              className="text-2xl font-bold text-gray-900 bg-transparent outline-none focus:bg-gray-50 rounded px-2 py-1 -ml-2 w-full"
            />
            <p className="text-sm text-gray-500 mt-1 px-2">
              Team: <span className="font-medium">{plan.team_name || '—'}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start</label>
              <input
                type="date"
                defaultValue={plan.start_date}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== plan.start_date) saveField('start_date', e.target.value);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End</label>
              <input
                type="date"
                defaultValue={plan.end_date}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== plan.end_date) saveField('end_date', e.target.value);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Jira sprint</label>
              <input
                type="text"
                defaultValue={plan.jira_sprint_name || ''}
                placeholder="e.g. Sprint 48"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (plan.jira_sprint_name || '')) saveField('jira_sprint_name', v);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-48"
              />
            </div>
          </div>
        </div>
      </div>

      {plan.working_days === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 mb-6 text-sm">
          This date range has no weekdays. All totals will be zero.
        </div>
      )}

      <CapacityTotalsPanel plan={plan} />

      <div className="flex items-center justify-end mb-3">
        <button
          onClick={() => setShowRangeModal(true)}
          className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add range
        </button>
      </div>

      <CapacityGrid plan={plan} onChange={load} />

      {plan.members.some((m) => m.is_excluded) && (
        <details className="bg-white rounded-xl border border-gray-200 p-4 mt-6">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            Excluded members ({plan.members.filter((m) => m.is_excluded).length})
          </summary>
          <ul className="mt-3 divide-y divide-gray-100">
            {plan.members.filter((m) => m.is_excluded).map((m) => (
              <li key={m.member_id} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-900">{m.member_name}</span>
                <button
                  onClick={() => reincludeMember(m.member_id)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Re-include
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <AddLeaveRangeModal
        isOpen={showRangeModal}
        onClose={() => setShowRangeModal(false)}
        onSaved={load}
        plan={plan}
        teams={teams}
        projects={projects}
      />
    </div>
  );
}
