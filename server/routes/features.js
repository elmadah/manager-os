const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { doneCondition } = require('../lib/doneCondition');

// GET /api/projects/:projectId/features
router.get('/projects/:projectId/features', (req, res) => {
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const features = db.prepare(`
      SELECT f.*,
        COALESCE(s.total, 0) AS total_stories,
        COALESCE(s.completed, 0) AS completed_stories,
        COALESCE(s.carry_overs, 0) AS carry_overs,
        COALESCE(s.total_points, 0) AS total_points,
        COALESCE(s.completed_points, 0) AS completed_points
      FROM features f
      LEFT JOIN (
        SELECT feature_id,
          COUNT(*) AS total,
          SUM(CASE WHEN ${doneCondition('status')} THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN carry_over_count > 0 THEN 1 ELSE 0 END) AS carry_overs,
          SUM(story_points) AS total_points,
          SUM(CASE WHEN ${doneCondition('status')} THEN story_points ELSE 0 END) AS completed_points
        FROM stories
        GROUP BY feature_id
      ) s ON s.feature_id = f.id
      WHERE f.project_id = ?
      ORDER BY f.created_at
    `).all(req.params.projectId);

    const result = features.map(f => ({
      id: f.id,
      project_id: f.project_id,
      name: f.name,
      description: f.description,
      status: f.status,
      priority: f.priority,
      start_date: f.start_date,
      target_date: f.target_date,
      created_at: f.created_at,
      updated_at: f.updated_at,
      story_stats: {
        total: f.total_stories,
        completed: f.completed_stories,
        carry_overs: f.carry_overs,
        points: f.total_points,
        completed_points: f.completed_points,
      },
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:projectId/features
router.post('/projects/:projectId/features', (req, res) => {
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { name, description, status, priority, start_date, target_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = db.prepare(`
      INSERT INTO features (project_id, name, description, status, priority, start_date, target_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.projectId, name, description || '', status || 'not_started', priority || 'medium', start_date || null, target_date || null);

    const feature = db.prepare('SELECT * FROM features WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(feature);
  } catch (err) {
    if (err.message.includes('CHECK constraint')) {
      return res.status(400).json({ error: 'Invalid status or priority value' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/features/:id
router.get('/features/:id', (req, res) => {
  try {
    const feature = db.prepare('SELECT * FROM features WHERE id = ?').get(req.params.id);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });

    const stories = db.prepare(`
      SELECT s.*, tm.name AS assignee_name
      FROM stories s
      LEFT JOIN team_members tm ON tm.id = s.assignee_id
      WHERE s.feature_id = ?
      ORDER BY s.created_at
    `).all(req.params.id);

    res.json({ ...feature, stories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/features/:featureId/stories
router.get('/features/:featureId/stories', (req, res) => {
  try {
    const feature = db.prepare('SELECT id FROM features WHERE id = ?').get(req.params.featureId);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });

    const stories = db.prepare(`
      SELECT s.*, tm.name AS assignee_name
      FROM stories s
      LEFT JOIN team_members tm ON tm.id = s.assignee_id
      WHERE s.feature_id = ?
      ORDER BY s.created_at
    `).all(req.params.featureId);

    res.json(stories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/features/:id
router.put('/features/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM features WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Feature not found' });

    const { name, description, status, priority, start_date, target_date } = req.body;
    db.prepare(`
      UPDATE features SET
        name = ?, description = ?, status = ?, priority = ?,
        start_date = ?, target_date = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name ?? existing.name,
      description ?? existing.description,
      status ?? existing.status,
      priority ?? existing.priority,
      start_date ?? existing.start_date,
      target_date ?? existing.target_date,
      req.params.id
    );

    const feature = db.prepare('SELECT * FROM features WHERE id = ?').get(req.params.id);
    res.json(feature);
  } catch (err) {
    if (err.message.includes('CHECK constraint')) {
      return res.status(400).json({ error: 'Invalid status or priority value' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/stories/:id
router.put('/stories/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Story not found' });

    const { summary, sprint, status, assignee_id, story_points, release_date, feature_id } = req.body;
    const newStatus = status ?? existing.status;
    const newSprint = sprint ?? existing.sprint;
    db.prepare(`
      UPDATE stories SET
        summary = ?, sprint = ?, status = ?, assignee_id = ?,
        story_points = ?, release_date = ?, feature_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      summary ?? existing.summary,
      newSprint,
      newStatus,
      assignee_id !== undefined ? assignee_id : existing.assignee_id,
      story_points ?? existing.story_points,
      release_date !== undefined ? release_date : existing.release_date,
      feature_id !== undefined ? feature_id : existing.feature_id,
      req.params.id
    );

    // Also update the latest story_sprint_history entry so sprint views reflect the change
    db.prepare(`
      UPDATE story_sprint_history SET status = ?
      WHERE id = (
        SELECT id FROM story_sprint_history
        WHERE story_id = ? AND sprint = ?
        ORDER BY imported_at DESC LIMIT 1
      )
    `).run(newStatus, req.params.id, newSprint);

    const story = db.prepare(`
      SELECT s.*, tm.name AS assignee_name,
        f.name AS feature_name, p.name AS project_name, p.id AS project_id
      FROM stories s
      LEFT JOIN team_members tm ON tm.id = s.assignee_id
      LEFT JOIN features f ON f.id = s.feature_id
      LEFT JOIN projects p ON p.id = f.project_id
      WHERE s.id = ?
    `).get(req.params.id);
    res.json(story);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/stories/:id
router.delete('/stories/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Story not found' });

    db.prepare('DELETE FROM stories WHERE id = ?').run(req.params.id);
    res.json({ message: 'Story deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/features/:id
router.delete('/features/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM features WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Feature not found' });

    db.prepare('DELETE FROM features WHERE id = ?').run(req.params.id);
    res.json({ message: 'Feature deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
