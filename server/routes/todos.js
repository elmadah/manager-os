const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/todos
router.get('/', (req, res) => {
  try {
    const { status, priority, overdue } = req.query;

    let sql = `
      SELECT t.*,
        p.name AS project_name,
        tm.name AS team_member_name
      FROM todos t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN team_members tm ON t.team_member_id = tm.id
      WHERE 1=1
    `;
    const params = [];

    if (status === 'active') {
      sql += ' AND t.is_complete = 0';
    } else if (status === 'completed') {
      sql += ' AND t.is_complete = 1';
    }

    if (priority && ['high', 'medium', 'low'].includes(priority)) {
      sql += ' AND t.priority = ?';
      params.push(priority);
    }

    if (overdue === 'true') {
      sql += " AND t.due_date < date('now') AND t.is_complete = 0";
    }

    sql += ' ORDER BY t.due_date ASC';

    const todos = db.prepare(sql).all(...params);
    res.json(todos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/todos/:id
router.get('/:id', (req, res) => {
  try {
    const todo = db.prepare(`
      SELECT t.*,
        p.name AS project_name,
        tm.name AS team_member_name
      FROM todos t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN team_members tm ON t.team_member_id = tm.id
      WHERE t.id = ?
    `).get(req.params.id);

    if (!todo) return res.status(404).json({ error: 'Todo not found' });
    res.json(todo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/todos
router.post('/', (req, res) => {
  try {
    const { title, description, due_date, priority, project_id, team_member_id } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const result = db.prepare(`
      INSERT INTO todos (title, description, due_date, priority, project_id, team_member_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      title,
      description || null,
      due_date || null,
      priority || 'medium',
      project_id || null,
      team_member_id || null
    );

    const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(todo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/todos/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Todo not found' });

    const { title, description, due_date, priority, project_id, team_member_id, is_complete } = req.body;

    db.prepare(`
      UPDATE todos
      SET title = ?, description = ?, due_date = ?, priority = ?,
          project_id = ?, team_member_id = ?, is_complete = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title ?? existing.title,
      description ?? existing.description,
      due_date ?? existing.due_date,
      priority ?? existing.priority,
      project_id ?? existing.project_id,
      team_member_id ?? existing.team_member_id,
      is_complete ?? existing.is_complete,
      req.params.id
    );

    const todo = db.prepare(`
      SELECT t.*,
        p.name AS project_name,
        tm.name AS team_member_name
      FROM todos t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN team_members tm ON t.team_member_id = tm.id
      WHERE t.id = ?
    `).get(req.params.id);
    res.json(todo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/todos/:id/toggle
router.put('/:id/toggle', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Todo not found' });

    const newVal = existing.is_complete ? 0 : 1;
    db.prepare('UPDATE todos SET is_complete = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newVal, req.params.id);

    const todo = db.prepare(`
      SELECT t.*,
        p.name AS project_name,
        tm.name AS team_member_name
      FROM todos t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN team_members tm ON t.team_member_id = tm.id
      WHERE t.id = ?
    `).get(req.params.id);
    res.json(todo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/todos/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Todo not found' });

    db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
