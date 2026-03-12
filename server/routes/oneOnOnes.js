const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/team/:teamMemberId/one-on-ones
router.get('/team/:teamMemberId/one-on-ones', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM one_on_ones
      WHERE team_member_id = ?
      ORDER BY date DESC
    `).all(req.params.teamMemberId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/one-on-ones/:id
router.get('/one-on-ones/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM one_on_ones WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: '1:1 not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/team/:teamMemberId/one-on-ones
router.post('/team/:teamMemberId/one-on-ones', (req, res) => {
  try {
    const { date, talking_points, action_items, sentiment } = req.body;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    const result = db.prepare(`
      INSERT INTO one_on_ones (team_member_id, date, talking_points, action_items, sentiment)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.params.teamMemberId,
      date,
      talking_points || '',
      action_items || '',
      sentiment || 'neutral'
    );

    const row = db.prepare('SELECT * FROM one_on_ones WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/one-on-ones/:id
router.put('/one-on-ones/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM one_on_ones WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '1:1 not found' });

    const { date, talking_points, action_items, sentiment } = req.body;

    db.prepare(`
      UPDATE one_on_ones
      SET date = ?, talking_points = ?, action_items = ?, sentiment = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      date ?? existing.date,
      talking_points ?? existing.talking_points,
      action_items ?? existing.action_items,
      sentiment ?? existing.sentiment,
      req.params.id
    );

    const row = db.prepare('SELECT * FROM one_on_ones WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/one-on-ones/:id
router.delete('/one-on-ones/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM one_on_ones WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '1:1 not found' });

    db.prepare('DELETE FROM one_on_ones WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
