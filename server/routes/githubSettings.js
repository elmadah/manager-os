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

  const existing = getSettings();
  // A masked token means "unchanged" — never overwrite a real token with stars.
  const token =
    pat_token && !pat_token.includes('****')
      ? pat_token
      : existing
        ? existing.pat_token
        : null;
  if (!token) return res.status(400).json({ error: 'pat_token is required' });

  if (existing) {
    db.prepare(
      "UPDATE github_settings SET base_url = ?, pat_token = ?, sync_days_back = ?, updated_at = datetime('now') WHERE id = 'default'"
    ).run(base_url, token, sync_days_back || 180);
  } else {
    db.prepare(
      "INSERT INTO github_settings (id, base_url, pat_token, sync_days_back) VALUES ('default', ?, ?, ?)"
    ).run(base_url, token, sync_days_back || 180);
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

router.post('/repos', (req, res) => {
  const { owner, name, label, project_id } = req.body;
  if (!owner || !name) {
    return res.status(400).json({ error: 'owner and name are required' });
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
  const { label, project_id, is_active } = req.body;
  db.prepare(
    'UPDATE github_repos SET label = ?, project_id = ?, is_active = ? WHERE id = ?'
  ).run(label || '', project_id || null, is_active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/repos/:id', (req, res) => {
  db.prepare('DELETE FROM github_repos WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- Sync ------------------------------------------------------------------

router.post('/sync', async (req, res) => {
  try {
    res.json(await syncAll());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
