import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/ToastProvider';
import CreateCapacityPlanModal from '../components/CreateCapacityPlanModal';

export default function CapacityListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [plans, setPlans] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.get('/teams').then(setTeams).catch(() => setTeams([]));
  }, []);

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  async function loadPlans() {
    setLoading(true);
    try {
      const qs = selectedTeamId ? `?team_id=${selectedTeamId}` : '';
      const data = await api.get(`/capacity-plans${qs}`);
      setPlans(data);
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(plan, e) {
    e.stopPropagation();
    if (!confirm(`Delete "${plan.name}"?`)) return;
    try {
      await api.del(`/capacity-plans/${plan.id}`);
      toast.success('Plan deleted');
      loadPlans();
    } catch (err) {
      toast.error(err.data?.error || 'Failed to delete plan');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Capacity</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New plan
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">No capacity plans yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create your first plan
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Team</th>
                <th className="text-left px-4 py-3 font-medium">Dates</th>
                <th className="text-left px-4 py-3 font-medium">Jira sprint</th>
                <th className="text-right px-4 py-3 font-medium">Planned h</th>
                <th className="text-right px-4 py-3 font-medium">Actual h</th>
                <th className="text-right px-4 py-3 font-medium">Util%</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plans.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/capacity/${p.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.team_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.start_date} → {p.end_date}</td>
                  <td className="px-4 py-3 text-gray-600">{p.jira_sprint_name || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.planned_hours}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.actual_hours}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.utilization_pct}%</td>
                  <td className="px-2 py-3 text-right">
                    <button
                      onClick={(e) => handleDelete(p, e)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateCapacityPlanModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(plan) => navigate(`/capacity/${plan.id}`)}
      />
    </div>
  );
}
