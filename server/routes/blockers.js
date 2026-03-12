const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/blockers
router.get('/', (req, res) => {
  try {
    const { status, severity, project_id } = req.query;

    let sql = `
      SELECT b.*,
        p.name AS project_name,
        f.name AS feature_name,
        tm.name AS team_member_name
      FROM blockers b
      LEFT JOIN projects p ON b.project_id = p.id
      LEFT JOIN features f ON b.feature_id = f.id
      LEFT JOIN team_members tm ON b.team_member_id = tm.id
      WHERE 1=1
    `;
    const params = [];

    if (status && ['active', 'monitoring', 'resolved'].includes(status)) {
      sql += ' AND b.status = ?';
      params.push(status);
    }

    if (severity && ['critical', 'high', 'medium', 'low'].includes(severity)) {
      sql += ' AND b.severity = ?';
      params.push(severity);
    }

    if (project_id) {
      sql += ' AND b.project_id = ?';
      params.push(project_id);
    }

    sql += ' ORDER BY b.created_at DESC';

    const blockers = db.prepare(sql).all(...params);
    res.json(blockers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/blockers/:id
router.get('/:id', (req, res) => {
  try {
    const blocker = db.prepare(`
      SELECT b.*,
        p.name AS project_name,
        f.name AS feature_name,
        tm.name AS team_member_name
      FROM blockers b
      LEFT JOIN projects p ON b.project_id = p.id
      LEFT JOIN features f ON b.feature_id = f.id
      LEFT JOIN team_members tm ON b.team_member_id = tm.id
      WHERE b.id = ?
    `).get(req.params.id);

    if (!blocker) return res.status(404).json({ error: 'Blocker not found' });
    res.json(blocker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/blockers
router.post('/', (req, res) => {
  try {
    const { title, description, severity, status, project_id, feature_id, team_member_id } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const result = db.prepare(`
      INSERT INTO blockers (title, description, severity, status, project_id, feature_id, team_member_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      description || '',
      severity || 'medium',
      status || 'active',
      project_id || null,
      feature_id || null,
      team_member_id || null
    );

    const blocker = db.prepare(`
      SELECT b.*,
        p.name AS project_name,
        f.name AS feature_name,
        tm.name AS team_member_name
      FROM blockers b
      LEFT JOIN projects p ON b.project_id = p.id
      LEFT JOIN features f ON b.feature_id = f.id
      LEFT JOIN team_members tm ON b.team_member_id = tm.id
      WHERE b.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(blocker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/blockers/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM blockers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Blocker not found' });

    const { title, description, severity, status, project_id, feature_id, team_member_id, resolved_at } = req.body;

    // Auto-set resolved_at when status changes to resolved
    let finalResolvedAt = resolved_at ?? existing.resolved_at;
    if (status === 'resolved' && !existing.resolved_at && !resolved_at) {
      finalResolvedAt = new Date().toISOString();
    }
    if (status && status !== 'resolved') {
      finalResolvedAt = null;
    }

    db.prepare(`
      UPDATE blockers
      SET title = ?, description = ?, severity = ?, status = ?,
          project_id = ?, feature_id = ?, team_member_id = ?, resolved_at = ?
      WHERE id = ?
    `).run(
      title ?? existing.title,
      description ?? existing.description,
      severity ?? existing.severity,
      status ?? existing.status,
      project_id !== undefined ? project_id : existing.project_id,
      feature_id !== undefined ? feature_id : existing.feature_id,
      team_member_id !== undefined ? team_member_id : existing.team_member_id,
      finalResolvedAt,
      req.params.id
    );

    const blocker = db.prepare(`
      SELECT b.*,
        p.name AS project_name,
        f.name AS feature_name,
        tm.name AS team_member_name
      FROM blockers b
      LEFT JOIN projects p ON b.project_id = p.id
      LEFT JOIN features f ON b.feature_id = f.id
      LEFT JOIN team_members tm ON b.team_member_id = tm.id
      WHERE b.id = ?
    `).get(req.params.id);
    res.json(blocker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/blockers/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM blockers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Blocker not found' });

    db.prepare('DELETE FROM blockers WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
