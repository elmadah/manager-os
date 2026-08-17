import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import api from '../lib/api';
import SettingsTabs from '../components/SettingsTabs';

/**
 * Warn about a base_url that is plausibly the github.com *website* address
 * rather than the API host. This is the exact mistake that produces an
 * opaque "GitHub API error: 422 Unprocessable Entity" from the sync/test
 * endpoints (the GraphQL POST lands on github.com/graphql, which isn't a
 * GraphQL endpoint at all). We only ever surface a hint here — we never
 * rewrite what the user typed.
 */
function baseUrlHint(value) {
  const trimmed = (value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (/^https?:\/\/(www\.)?github\.com$/i.test(trimmed)) {
    return 'This is the github.com website address, not the API host. GitHub Cloud’s API base URL is https://api.github.com.';
  }
  if (/^https?:\/\/(www\.)?github\.com\//i.test(trimmed) && !/\/api\b/i.test(trimmed)) {
    return 'This looks like a github.com web URL rather than an API host. Use https://api.github.com for GitHub Cloud, or https://your-host/api for GitHub Enterprise.';
  }
  return null;
}

function StatusMessage({ status }) {
  if (!status) return null;
  const Icon = status.ok ? CheckCircle2 : AlertTriangle;
  return (
    <p
      role="status"
      aria-live="polite"
      className={`flex items-start gap-1.5 text-sm ${status.ok ? 'text-green-700' : 'text-red-600'}`}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-medium">{status.ok ? 'Success: ' : 'Error: '}</span>
        {status.message}
      </span>
    </p>
  );
}

export default function GitHubSettingsPage() {
  const [form, setForm] = useState({ base_url: 'https://api.github.com', pat_token: '', sync_days_back: 180 });
  const [savedSettings, setSavedSettings] = useState(null);
  const [repos, setRepos] = useState([]);
  const [projects, setProjects] = useState([]);
  const [newRepo, setNewRepo] = useState({ owner: '', name: '' });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [settings, repoList, projectList] = await Promise.all([
      api.get('/settings/github'),
      api.get('/settings/github/repos'),
      api.get('/projects'),
    ]);
    if (settings) {
      setForm(settings);
      setSavedSettings(settings);
    }
    setRepos(repoList);
    setProjects(projectList);
  }

  useEffect(() => {
    load();
  }, []);

  // Test Connection and Sync Now both act on whatever is currently saved on
  // the server, not on unsaved edits in this form — flag that explicitly so
  // a base_url typo doesn't get "tested" against the old, still-saved value
  // and produce a confusing result.
  const isDirty =
    !!savedSettings &&
    (form.base_url !== savedSettings.base_url ||
      form.pat_token !== savedSettings.pat_token ||
      Number(form.sync_days_back) !== Number(savedSettings.sync_days_back));

  const hint = baseUrlHint(form.base_url);

  async function save() {
    setBusy(true);
    try {
      await api.put('/settings/github', form);
      setStatus({ ok: true, message: 'Saved' });
      await load();
    } catch (err) {
      setStatus({ ok: false, message: (err.data && err.data.error) || err.message });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const result = await api.post('/settings/github/test');
      setStatus({ ok: true, message: `Connected as ${result.login}` });
    } catch (err) {
      let message = (err.data && err.data.error) || err.message;
      // The server tests the saved base_url, so only attach the base_url
      // hint when the saved value is the one likely at fault.
      const savedHint = savedSettings ? baseUrlHint(savedSettings.base_url) : null;
      if (savedHint) {
        message = `${message} — ${savedHint}`;
      }
      setStatus({ ok: false, message });
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    try {
      const result = await api.post('/settings/github/sync');
      const failedNames = result.failed.map((f) => f.repo).join(', ');
      setStatus({
        ok: result.failed.length === 0,
        message: `${result.counts.succeeded} of ${result.counts.repos} repos synced, ${result.counts.prs} PRs${
          result.failed.length ? ` — failed: ${failedNames}` : ''
        }`,
      });
      await load();
    } catch (err) {
      setStatus({ ok: false, message: (err.data && err.data.error) || err.message });
    } finally {
      setBusy(false);
    }
  }

  async function addRepo() {
    if (!newRepo.owner || !newRepo.name) return;
    try {
      await api.post('/settings/github/repos', newRepo);
      setNewRepo({ owner: '', name: '' });
      setStatus(null);
      await load();
    } catch (err) {
      setStatus({ ok: false, message: (err.data && err.data.error) || err.message });
    }
  }

  async function removeRepo(id) {
    await api.del(`/settings/github/repos/${id}`);
    await load();
  }

  async function setRepoProject(repo, projectId) {
    await api.put(`/settings/github/repos/${repo.id}`, {
      label: repo.label,
      project_id: projectId ? Number(projectId) : null,
      is_active: repo.is_active,
    });
    await load();
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>
      <SettingsTabs />

      <div className="max-w-2xl space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Connection</h2>

          <label className="block">
            <span className="text-xs text-gray-500">API base URL</span>
            <input
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              placeholder="https://api.github.com"
              aria-describedby="base-url-help"
              className={`w-full border rounded px-3 py-2 text-sm ${
                hint ? 'border-amber-400' : 'border-gray-300'
              }`}
            />
            <span id="base-url-help" className="block text-[11px] text-gray-400 mt-1">
              GitHub Cloud: https://api.github.com. GitHub Enterprise: https://your-host/api.
            </span>
            {hint && (
              <span role="status" className="flex items-start gap-1 text-[11px] text-amber-700 mt-1">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                {hint}
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-xs text-gray-500">Personal access token</span>
            <input
              type="password"
              value={form.pat_token}
              onChange={(e) => setForm({ ...form, pat_token: e.target.value })}
              autoComplete="off"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <span className="text-[11px] text-gray-400">
              Needs the `repo` scope. Leave the masked value untouched to keep the current token.
            </span>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500">History window (days)</span>
            <input
              type="number"
              min="1"
              value={form.sync_days_back}
              onChange={(e) => setForm({ ...form, sync_days_back: Number(e.target.value) })}
              className="w-32 border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={save} disabled={busy}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-50">Save</button>
            <button onClick={test} disabled={busy}
              className="px-3 py-2 text-sm border border-gray-300 rounded disabled:opacity-50">Test connection</button>
            <button onClick={sync} disabled={busy}
              className="px-3 py-2 text-sm border border-gray-300 rounded disabled:opacity-50">Sync now</button>
            {isDirty && (
              <span className="text-[11px] text-amber-700">
                Unsaved changes — Save before testing or syncing so they check the values above.
              </span>
            )}
          </div>

          <StatusMessage status={status} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Tracked repositories</h2>

          <div className="flex gap-2">
            <label className="sr-only" htmlFor="new-repo-owner">Repository owner</label>
            <input
              id="new-repo-owner"
              value={newRepo.owner}
              onChange={(e) => setNewRepo({ ...newRepo, owner: e.target.value })}
              placeholder="owner"
              className="border border-gray-300 rounded px-3 py-2 text-sm w-40"
            />
            <label className="sr-only" htmlFor="new-repo-name">Repository name</label>
            <input
              id="new-repo-name"
              value={newRepo.name}
              onChange={(e) => setNewRepo({ ...newRepo, name: e.target.value })}
              placeholder="repo"
              className="border border-gray-300 rounded px-3 py-2 text-sm w-48"
            />
            <button onClick={addRepo}
              className="px-3 py-2 text-sm border border-gray-300 rounded">Add repository</button>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
                <th className="text-left py-1 px-2">Repo</th>
                <th className="text-left py-1 px-2">Project</th>
                <th className="text-left py-1 px-2">Last sync</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {repos.map((repo) => (
                <tr key={repo.id} className="border-b border-gray-100">
                  <td className="py-1.5 px-2">{repo.owner}/{repo.name}</td>
                  <td className="py-1.5 px-2">
                    <label className="sr-only" htmlFor={`repo-project-${repo.id}`}>
                      Project for {repo.owner}/{repo.name}
                    </label>
                    <select
                      id={`repo-project-${repo.id}`}
                      value={repo.project_id || ''}
                      onChange={(e) => setRepoProject(repo, e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="">Unmapped</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 px-2">
                    {repo.last_sync_error ? (
                      <span className="text-red-600" title={repo.last_sync_error}>
                        Failed
                        <span className="sr-only">: {repo.last_sync_error}</span>
                      </span>
                    ) : (
                      <span className="text-gray-500">{repo.last_sync_at || 'never'}</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <button
                      onClick={() => removeRepo(repo.id)}
                      aria-label={`Remove ${repo.owner}/${repo.name}`}
                      className="text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {repos.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 px-2 text-center text-gray-400">
                    No repositories tracked yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
