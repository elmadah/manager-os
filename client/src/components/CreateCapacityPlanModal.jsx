import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from './ToastProvider';

const EMPTY_FORM = {
  name: '',
  team_id: '',
  start_date: '',
  end_date: '',
  jira_sprint_name: '',
};

export default function CreateCapacityPlanModal({ isOpen, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [teams, setTeams] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setForm(EMPTY_FORM);
    setError(null);
    api.get('/teams').then(setTeams).catch(() => setTeams([]));
  }, [isOpen]);

  if (!isOpen) return null;

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        team_id: Number(form.team_id),
        start_date: form.start_date,
        end_date: form.end_date,
        jira_sprint_name: form.jira_sprint_name.trim() || null,
      };
      const plan = await api.post('/capacity-plans', payload);
      toast.success('Capacity plan created');
      onCreated(plan);
      onClose();
    } catch (err) {
      setError(err.data?.error || 'Failed to create plan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">New capacity plan</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Sprint 48 planning"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
            <select
              name="team_id"
              value={form.team_id}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select a team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
              <input
                type="date"
                name="end_date"
                value={form.end_date}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Jira sprint name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              name="jira_sprint_name"
              value={form.jira_sprint_name}
              onChange={handleChange}
              placeholder="Sprint 48"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">Link later, once the Jira sprint exists.</p>
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Create plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
