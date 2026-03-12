import { useState, useEffect } from 'react';
import { Plus, ShieldAlert, X, Check, Pencil, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import api from '../lib/api';
import { useToast } from '../components/ToastProvider';

const SEVERITY_STYLES = {
  critical: { badge: 'bg-red-100 text-red-700', border: 'border-l-red-500' },
  high: { badge: 'bg-orange-100 text-orange-700', border: 'border-l-orange-500' },
  medium: { badge: 'bg-yellow-100 text-yellow-700', border: 'border-l-yellow-500' },
  low: { badge: 'bg-gray-100 text-gray-600', border: 'border-l-gray-400' },
};

const STATUS_STYLES = {
  active: 'bg-red-100 text-red-700',
  monitoring: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
};

const STATUS_LABELS = { active: 'Active', monitoring: 'Monitoring', resolved: 'Resolved' };
const SEVERITY_LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

export default function BlockersPage() {
  const toast = useToast();
  const [blockers, setBlockers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingBlocker, setEditingBlocker] = useState(null);
  const [expanded, setExpanded] = useState({});

  // Lookup data for dropdowns
  const [projects, setProjects] = useState([]);
  const [features, setFeatures] = useState({});
  const [teamMembers, setTeamMembers] = useState([]);

  async function loadBlockers() {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      const data = await api.get(`/blockers?${params}`);
      setBlockers(data);
    } catch (err) {
      console.error('Failed to load blockers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadLookups() {
    try {
      const [p, t] = await Promise.all([api.get('/projects'), api.get('/team')]);
      setProjects(p);
      setTeamMembers(t);
    } catch (err) {
      console.error('Failed to load lookups:', err);
    }
  }

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    setLoading(true);
    loadBlockers();
  }, [statusFilter, severityFilter]);

  async function handleResolve(blocker) {
    try {
      await api.put(`/blockers/${blocker.id}`, { status: 'resolved' });
      toast.success('Blocker resolved');
      loadBlockers();
    } catch {
      toast.error('Failed to resolve blocker');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this blocker?')) return;
    try {
      await api.del(`/blockers/${id}`);
      toast.success('Blocker deleted');
      loadBlockers();
    } catch {
      toast.error('Failed to delete blocker');
    }
  }

  // Stats from all active blockers (unfiltered by severity)
  const [allActive, setAllActive] = useState([]);
  useEffect(() => {
    api.get('/blockers?status=active').then(setAllActive).catch(() => {});
  }, [blockers]);

  const severityCounts = {
    critical: allActive.filter((b) => b.severity === 'critical').length,
    high: allActive.filter((b) => b.severity === 'high').length,
    medium: allActive.filter((b) => b.severity === 'medium').length,
    low: allActive.filter((b) => b.severity === 'low').length,
  };

  if (loading && blockers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Risks & Blockers</h1>
        <button
          onClick={() => { setEditingBlocker(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Blocker
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {['critical', 'high', 'medium', 'low'].map((sev) => (
          <div key={sev} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <span className={`inline-block w-3 h-3 rounded-full ${SEVERITY_STYLES[sev].badge.split(' ')[0].replace('bg-', 'bg-').replace('-100', '-500')}`}
              style={{ backgroundColor: { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#9ca3af' }[sev] }}
            />
            <div>
              <p className="text-2xl font-bold text-gray-900">{severityCounts[sev]}</p>
              <p className="text-sm text-gray-500">{SEVERITY_LABELS[sev]}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
          {['active', 'monitoring', 'resolved', 'all'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === s ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Blocker Cards */}
      {blockers.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <ShieldAlert size={48} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">No blockers found</h2>
          <p className="text-gray-500">
            {statusFilter === 'active' ? 'No active blockers — great news!' : 'No blockers match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {blockers.map((blocker) => {
            const sev = SEVERITY_STYLES[blocker.severity] || SEVERITY_STYLES.medium;
            const isExpanded = expanded[blocker.id];
            const descLong = blocker.description && blocker.description.length > 200;

            return (
              <div
                key={blocker.id}
                className={`bg-white rounded-xl border border-gray-200 border-l-4 ${sev.border} shadow-sm hover:shadow-md transition-all`}
              >
                <div className="p-5">
                  {/* Top row: title + badges + actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 mb-1">{blocker.title}</h3>

                      {/* Description */}
                      {blocker.description && (
                        <div className={`text-sm text-gray-600 prose prose-sm max-w-none ${!isExpanded && descLong ? 'line-clamp-3' : ''}`}>
                          <ReactMarkdown>{blocker.description}</ReactMarkdown>
                        </div>
                      )}
                      {descLong && (
                        <button
                          onClick={() => setExpanded((prev) => ({ ...prev, [blocker.id]: !isExpanded }))}
                          className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                        >
                          {isExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {blocker.status !== 'resolved' && (
                        <button
                          onClick={() => handleResolve(blocker)}
                          title="Resolve"
                          className="p-1.5 rounded-md text-green-600 hover:bg-green-50 transition-colors"
                        >
                          <Check size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => { setEditingBlocker(blocker); setShowModal(true); }}
                        title="Edit"
                        className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(blocker.id)}
                        title="Delete"
                        className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${sev.badge}`}>
                      {SEVERITY_LABELS[blocker.severity]}
                    </span>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${STATUS_STYLES[blocker.status]}`}>
                      {STATUS_LABELS[blocker.status]}
                    </span>

                    {blocker.project_name && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {blocker.project_name}
                      </span>
                    )}
                    {blocker.feature_name && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {blocker.feature_name}
                      </span>
                    )}
                    {blocker.team_member_name && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {blocker.team_member_name}
                      </span>
                    )}

                    <span className="text-xs text-gray-400 ml-auto">
                      Created {new Date(blocker.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {blocker.resolved_at && (
                      <span className="text-xs text-green-600">
                        Resolved {new Date(blocker.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <BlockerModal
          blocker={editingBlocker}
          projects={projects}
          features={features}
          setFeatures={setFeatures}
          teamMembers={teamMembers}
          toast={toast}
          onClose={() => { setShowModal(false); setEditingBlocker(null); }}
          onSaved={() => { setShowModal(false); setEditingBlocker(null); loadBlockers(); }}
        />
      )}
    </div>
  );
}

function BlockerModal({ blocker, projects, features, setFeatures, teamMembers, toast, onClose, onSaved }) {
  const isEdit = !!blocker;
  const [form, setForm] = useState({
    title: blocker?.title || '',
    description: blocker?.description || '',
    severity: blocker?.severity || 'medium',
    status: blocker?.status || 'active',
    project_id: blocker?.project_id || '',
    feature_id: blocker?.feature_id || '',
    team_member_id: blocker?.team_member_id || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Load features when project changes
  const projectFeatures = features[form.project_id] || [];

  useEffect(() => {
    if (!form.project_id) return;
    if (features[form.project_id]) return;
    api.get(`/projects/${form.project_id}/features`).then((data) => {
      setFeatures((prev) => ({ ...prev, [form.project_id]: data }));
    }).catch(() => {});
  }, [form.project_id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...form,
        project_id: form.project_id || null,
        feature_id: form.feature_id || null,
        team_member_id: form.team_member_id || null,
      };
      if (isEdit) {
        await api.put(`/blockers/${blocker.id}`, payload);
        toast.success('Blocker updated');
      } else {
        await api.post('/blockers', payload);
        toast.success('Blocker created');
      }
      onSaved();
    } catch (err) {
      setError(err.data?.error || 'Failed to save blocker');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Blocker' : 'Add Blocker'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="What's blocking progress?"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Details, context, markdown supported…"
            />
          </div>

          {/* Severity + Status row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="active">Active</option>
                <option value="monitoring">Monitoring</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>

          {/* Project */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
            <select
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value, feature_id: '' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Feature (filtered by project) */}
          {form.project_id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Feature</label>
              <select
                value={form.feature_id}
                onChange={(e) => setForm({ ...form, feature_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">None</option>
                {projectFeatures.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Team Member */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team Member</label>
            <select
              value={form.team_member_id}
              onChange={(e) => setForm({ ...form, team_member_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">None</option>
              {teamMembers.map((tm) => (
                <option key={tm.id} value={tm.id}>{tm.name}</option>
              ))}
            </select>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Blocker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
