const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/teams — list all teams with counts
router.get('/', (req, res) => {
  try {
    const teams = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM team_member_assignments WHERE team_id = t.id) AS member_count,
        (SELECT COUNT(*) FROM jira_boards WHERE team_id = t.id) AS board_count,
        (SELECT COUNT(*) FROM projects WHERE team_id = t.id) AS project_count
      FROM teams t
      ORDER BY t.name
    `).all();
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/:id — single team with assigned IDs
router.get('/:id', (req, res) => {
  try {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(req.params.id));
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const members = db.prepare('SELECT member_id AS id FROM team_member_assignments WHERE team_id = ?').all(Number(req.params.id));
    const boards = db.prepare('SELECT id FROM jira_boards WHERE team_id = ?').all(Number(req.params.id));
    const projects = db.prepare('SELECT id FROM projects WHERE team_id = ?').all(Number(req.params.id));

    res.json({
      ...team,
      member_ids: members.map(m => m.id),
      board_ids: boards.map(b => b.id),
      project_ids: projects.map(p => p.id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teams — create team
router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const result = db.prepare('INSERT INTO teams (name) VALUES (?)').run(name.trim());
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/teams/:id — update team name
router.put('/:id', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(name.trim(), Number(req.params.id));
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(Number(req.params.id));
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/teams/:id/assignments — bulk assign members, boards, projects
router.put('/:id/assignments', (req, res) => {
  try {
    const teamId = Number(req.params.id);
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const { member_ids = [], board_ids = [], project_ids = [] } = req.body;

    const assign = db.transaction(() => {
      db.prepare('DELETE FROM team_member_assignments WHERE team_id = ?').run(teamId);
      for (const id of member_ids) {
        db.prepare('INSERT OR IGNORE INTO team_member_assignments (team_id, member_id) VALUES (?, ?)').run(teamId, id);
      }

      db.prepare('UPDATE jira_boards SET team_id = NULL WHERE team_id = ?').run(teamId);
      for (const id of board_ids) {
        db.prepare('UPDATE jira_boards SET team_id = ? WHERE id = ?').run(teamId, id);
      }

      db.prepare('UPDATE projects SET team_id = NULL WHERE team_id = ?').run(teamId);
      for (const id of project_ids) {
        db.prepare('UPDATE projects SET team_id = ? WHERE id = ?').run(teamId, id);
      }
    });

    assign();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/teams/:id — delete team (nullify children)
router.delete('/:id', (req, res) => {
  try {
    const teamId = Number(req.params.id);
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const remove = db.transaction(() => {
      db.prepare('DELETE FROM team_member_assignments WHERE team_id = ?').run(teamId);
      db.prepare('UPDATE jira_boards SET team_id = NULL WHERE team_id = ?').run(teamId);
      db.prepare('UPDATE projects SET team_id = NULL WHERE team_id = ?').run(teamId);
      db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);
    });

    remove();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
