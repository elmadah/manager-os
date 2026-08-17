const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { graphql } = require('../services/githubClient');
const { syncAll } = require('../services/githubSync');

function getSettings() {
  return db.prepare("SELECT * FROM github_settings WHERE id = 'default'").get();
}

function maskToken(token) {
  if (!token || token.length < 8) return '****';
  return token.slice(0, 4) + '****' + token.slice(-4);
}

// --- Settings --------------------------------------------------------------

router.get('/', (req, res) => {
  const settings = getSettings();
  if (!settings) return res.json(null);
  res.json({
    base_url: settings.base_url,
    pat_token: maskToken(settings.pat_token),
    sync_days_back: settings.sync_days_back,
    last_sync_at: settings.last_sync_at,
  });
});

router.put('/', (req, res) => {
  const { base_url, pat_token, sync_days_back } = req.body;
  if (!base_url) return res.status(400).json({ error: 'base_url is required' });
  const normalizedBaseUrl = base_url.replace(/\/+$/, '');

  const existing = getSettings();
  // The exact mask GET would have produced for the stored token means "unchanged".
  // An empty string, null, or omitted field also means "unchanged".
  const isUnchanged =
    !pat_token || (existing && pat_token === maskToken(existing.pat_token));
  const token = isUnchanged ? (existing ? existing.pat_token : null) : pat_token;
  if (!token) return res.status(400).json({ error: 'pat_token is required' });

  if (existing) {
    db.prepare(
      "UPDATE github_settings SET base_url = ?, pat_token = ?, sync_days_back = ?, updated_at = datetime('now') WHERE id = 'default'"
    ).run(normalizedBaseUrl, token, sync_days_back || 180);
  } else {
    db.prepare(
      "INSERT INTO github_settings (id, base_url, pat_token, sync_days_back) VALUES ('default', ?, ?, ?)"
    ).run(normalizedBaseUrl, token, sync_days_back || 180);
  }
  res.json({ ok: true });
});

router.post('/test', async (req, res) => {
  const settings = getSettings();
  if (!settings) return res.status(400).json({ error: 'GitHub is not configured' });
  try {
    const data = await graphql(settings, '{ viewer { login } }', {});
    res.json({ ok: true, login: data.viewer.login });
  } catch (err) {
    res.status(err.status === 401 ? 401 : 502).json({ error: err.message });
  }
});

// --- Repos -----------------------------------------------------------------

router.get('/repos', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT r.*, p.name AS project_name
         FROM github_repos r
         LEFT JOIN projects p ON p.id = r.project_id
         ORDER BY r.owner, r.name`
      )
      .all()
  );
});

// GitHub-legal owner/name: letters, digits, hyphen, underscore, dot.
const GITHUB_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

router.post('/repos', (req, res) => {
  const { owner, name, label, project_id } = req.body;
  if (!owner || !name) {
    return res.status(400).json({ error: 'owner and name are required' });
  }
  if (!GITHUB_NAME_PATTERN.test(owner) || !GITHUB_NAME_PATTERN.test(name)) {
    return res.status(400).json({ error: 'owner and name may only contain letters, digits, hyphens, underscores, and dots' });
  }
  const existing = db
    .prepare('SELECT id FROM github_repos WHERE owner = ? AND name = ?')
    .get(owner, name);
  if (existing) return res.status(409).json({ error: 'Repo already tracked' });

  db.prepare(
    'INSERT INTO github_repos (owner, name, label, project_id) VALUES (?,?,?,?)'
  ).run(owner, name, label || '', project_id || null);
  res.status(201).json({ ok: true });
});

router.put('/repos/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM github_repos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Repo not found' });

  const { label, project_id, is_active } = req.body;
  const nextLabel = label === undefined ? existing.label : label || '';
  const nextProjectId = project_id === undefined ? existing.project_id : project_id || null;
  const nextIsActive = is_active === undefined ? existing.is_active : is_active ? 1 : 0;

  db.prepare(
    'UPDATE github_repos SET label = ?, project_id = ?, is_active = ? WHERE id = ?'
  ).run(nextLabel, nextProjectId, nextIsActive, req.params.id);
  res.json({ ok: true });
});

router.delete('/repos/:id', (req, res) => {
  db.prepare('DELETE FROM github_repos WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- Sync ------------------------------------------------------------------

let syncInFlight = false;

router.post('/sync', async (req, res) => {
  if (syncInFlight) {
    return res.status(409).json({ error: 'A sync is already in progress' });
  }
  syncInFlight = true;
  try {
    res.json(await syncAll());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  } finally {
    syncInFlight = false;
  }
});

module.exports = router;
