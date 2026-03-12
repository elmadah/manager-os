const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/projects — list all with feature_count and story_stats
router.get('/', (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM features WHERE project_id = p.id) AS feature_count,
        COALESCE(s.total_stories, 0) AS total_stories,
        COALESCE(s.completed_stories, 0) AS completed_stories,
        COALESCE(s.total_points, 0) AS total_points,
        COALESCE(s.completed_points, 0) AS completed_points
      FROM projects p
      LEFT JOIN (
        SELECT f.project_id,
          COUNT(st.id) AS total_stories,
          SUM(CASE WHEN st.status = 'Done' THEN 1 ELSE 0 END) AS completed_stories,
          SUM(st.story_points) AS total_points,
          SUM(CASE WHEN st.status = 'Done' THEN st.story_points ELSE 0 END) AS completed_points
        FROM features f
        JOIN stories st ON st.feature_id = f.id
        GROUP BY f.project_id
      ) s ON s.project_id = p.id
      ORDER BY p.updated_at DESC
    `).all();

    const result = projects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      health: p.health,
      start_date: p.start_date,
      target_date: p.target_date,
      created_at: p.created_at,
      updated_at: p.updated_at,
      feature_count: p.feature_count,
      story_stats: {
        total_stories: p.total_stories,
        completed_stories: p.completed_stories,
        total_points: p.total_points,
        completed_points: p.completed_points,
      },
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id
router.get('/:id', (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const features = db.prepare(`
      SELECT f.*,
        COALESCE(s.total, 0) AS total_stories,
        COALESCE(s.completed, 0) AS completed_stories,
        COALESCE(s.total_points, 0) AS total_points,
        COALESCE(s.completed_points, 0) AS completed_points
      FROM features f
      LEFT JOIN (
        SELECT feature_id,
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END) AS completed,
          SUM(story_points) AS total_points,
          SUM(CASE WHEN status = 'Done' THEN story_points ELSE 0 END) AS completed_points
        FROM stories
        GROUP BY feature_id
      ) s ON s.feature_id = f.id
      WHERE f.project_id = ?
      ORDER BY f.created_at
    `).all(req.params.id);

    const storyStats = features.reduce(
      (acc, f) => ({
        total_stories: acc.total_stories + f.total_stories,
        completed_stories: acc.completed_stories + f.completed_stories,
        total_points: acc.total_points + f.total_points,
        completed_points: acc.completed_points + f.completed_points,
      }),
      { total_stories: 0, completed_stories: 0, total_points: 0, completed_points: 0 }
    );

    res.json({ ...project, features, story_stats: storyStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects
router.post('/', (req, res) => {
  try {
    const { name, description, status, health, start_date, target_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = db.prepare(`
      INSERT INTO projects (name, description, status, health, start_date, target_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, description || '', status || 'upcoming', health || 'green', start_date || null, target_date || null);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(project);
  } catch (err) {
    if (err.message.includes('CHECK constraint')) {
      return res.status(400).json({ error: 'Invalid status or health value' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const { name, description, status, health, start_date, target_date } = req.body;
    db.prepare(`
      UPDATE projects SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        health = COALESCE(?, health),
        start_date = COALESCE(?, start_date),
        target_date = COALESCE(?, target_date),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(name, description, status, health, start_date, target_date, req.params.id);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json(project);
  } catch (err) {
    if (err.message.includes('CHECK constraint')) {
      return res.status(400).json({ error: 'Invalid status or health value' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
