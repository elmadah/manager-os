const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/notes
router.get('/', (req, res) => {
  try {
    const { category, project_id, feature_id, team_member_id, search } = req.query;

    let sql = `
      SELECT n.*,
        p.name AS project_name,
        f.name AS feature_name,
        tm.name AS team_member_name
      FROM notes n
      LEFT JOIN projects p ON n.project_id = p.id
      LEFT JOIN features f ON n.feature_id = f.id
      LEFT JOIN team_members tm ON n.team_member_id = tm.id
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      sql += ' AND n.category = ?';
      params.push(category);
    }

    if (project_id) {
      sql += ' AND n.project_id = ?';
      params.push(project_id);
    }

    if (feature_id) {
      sql += ' AND n.feature_id = ?';
      params.push(feature_id);
    }

    if (team_member_id) {
      sql += ' AND n.team_member_id = ?';
      params.push(team_member_id);
    }

    if (search) {
      sql += ' AND n.content LIKE ?';
      params.push(`%${search}%`);
    }

    sql += ' ORDER BY n.updated_at DESC';

    const notes = db.prepare(sql).all(...params);
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/:id
router.get('/:id', (req, res) => {
  try {
    const note = db.prepare(`
      SELECT n.*,
        p.name AS project_name,
        f.name AS feature_name,
        tm.name AS team_member_name
      FROM notes n
      LEFT JOIN projects p ON n.project_id = p.id
      LEFT JOIN features f ON n.feature_id = f.id
      LEFT JOIN team_members tm ON n.team_member_id = tm.id
      WHERE n.id = ?
    `).get(req.params.id);

    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notes
router.post('/', (req, res) => {
  try {
    const { content, category, project_id, feature_id, team_member_id } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required' });

    const result = db.prepare(`
      INSERT INTO notes (content, category, project_id, feature_id, team_member_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      content,
      category || 'general',
      project_id || null,
      feature_id || null,
      team_member_id || null
    );

    const note = db.prepare(`
      SELECT n.*,
        p.name AS project_name,
        f.name AS feature_name,
        tm.name AS team_member_name
      FROM notes n
      LEFT JOIN projects p ON n.project_id = p.id
      LEFT JOIN features f ON n.feature_id = f.id
      LEFT JOIN team_members tm ON n.team_member_id = tm.id
      WHERE n.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/notes/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    const { content, category, project_id, feature_id, team_member_id } = req.body;

    db.prepare(`
      UPDATE notes
      SET content = ?, category = ?, project_id = ?, feature_id = ?, team_member_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      content ?? existing.content,
      category ?? existing.category,
      project_id !== undefined ? (project_id || null) : existing.project_id,
      feature_id !== undefined ? (feature_id || null) : existing.feature_id,
      team_member_id !== undefined ? (team_member_id || null) : existing.team_member_id,
      req.params.id
    );

    const note = db.prepare(`
      SELECT n.*,
        p.name AS project_name,
        f.name AS feature_name,
        tm.name AS team_member_name
      FROM notes n
      LEFT JOIN projects p ON n.project_id = p.id
      LEFT JOIN features f ON n.feature_id = f.id
      LEFT JOIN team_members tm ON n.team_member_id = tm.id
      WHERE n.id = ?
    `).get(req.params.id);
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
