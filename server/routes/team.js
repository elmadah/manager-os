const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/team — list all with active story count
router.get('/', (req, res) => {
  try {
    const members = db.prepare(`
      SELECT tm.*,
        COALESCE(s.active_stories, 0) AS active_story_count
      FROM team_members tm
      LEFT JOIN (
        SELECT assignee_id, COUNT(*) AS active_stories
        FROM stories
        WHERE status != 'Done'
        GROUP BY assignee_id
      ) s ON s.assignee_id = tm.id
      ORDER BY tm.name
    `).all();

    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/team/:id — member with stories grouped by project
router.get('/:id', (req, res) => {
  try {
    const member = db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id);
    if (!member) return res.status(404).json({ error: 'Team member not found' });

    const stories = db.prepare(`
      SELECT s.*, p.name AS project_name, p.id AS project_id
      FROM stories s
      LEFT JOIN features f ON f.id = s.feature_id
      LEFT JOIN projects p ON p.id = f.project_id
      WHERE s.assignee_id = ?
      ORDER BY p.name, s.created_at
    `).all(req.params.id);

    // Group stories by project
    const byProject = {};
    for (const story of stories) {
      const key = story.project_id || 'unassigned';
      if (!byProject[key]) {
        byProject[key] = {
          project_id: story.project_id,
          project_name: story.project_name || 'Unassigned',
          stories: [],
        };
      }
      byProject[key].stories.push(story);
    }

    res.json({ ...member, projects: Object.values(byProject) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/team
router.post('/', (req, res) => {
  try {
    const { name, role, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = db.prepare(`
      INSERT INTO team_members (name, role, email) VALUES (?, ?, ?)
    `).run(name, role || '', email || '');

    const member = db.prepare('SELECT * FROM team_members WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/team/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Team member not found' });

    const { name, role, email } = req.body;
    db.prepare(`
      UPDATE team_members SET
        name = COALESCE(?, name),
        role = COALESCE(?, role),
        email = COALESCE(?, email)
      WHERE id = ?
    `).run(name, role, email, req.params.id);

    const member = db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id);
    res.json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/team/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Team member not found' });

    db.prepare('DELETE FROM team_members WHERE id = ?').run(req.params.id);
    res.json({ message: 'Team member deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
