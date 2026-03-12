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

// GET /api/team/:id/stories — stories grouped by status with summary stats
router.get('/:id/stories', (req, res) => {
  try {
    const member = db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id);
    if (!member) return res.status(404).json({ error: 'Team member not found' });

    const stories = db.prepare(`
      SELECT s.*,
        f.name AS feature_name,
        p.name AS project_name,
        p.id AS project_id
      FROM stories s
      LEFT JOIN features f ON f.id = s.feature_id
      LEFT JOIN projects p ON p.id = f.project_id
      WHERE s.assignee_id = ?
      ORDER BY p.name, f.name, s.created_at
    `).all(req.params.id);

    const inProgress = stories.filter(s => s.status !== 'Done');
    const carryOver = stories.filter(s => s.status !== 'Done' && s.carry_over_count > 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const completedRecently = stories.filter(s =>
      s.status === 'Done' && s.updated_at && new Date(s.updated_at) >= thirtyDaysAgo
    );

    const completedWithTime = stories.filter(s => s.status === 'Done' && s.sprints_to_complete > 0);
    const avgSprintsToComplete = completedWithTime.length > 0
      ? +(completedWithTime.reduce((sum, s) => sum + s.sprints_to_complete, 0) / completedWithTime.length).toFixed(1)
      : 0;

    const grouped = {
      in_progress: inProgress,
      carry_over: carryOver,
      completed_recently: completedRecently,
    };

    const stats = {
      total_active: inProgress.length,
      total_points_in_progress: inProgress.reduce((sum, s) => sum + (s.story_points || 0), 0),
      carry_over_count: carryOver.length,
      completed_last_30_days: completedRecently.length,
      avg_sprints_to_complete: avgSprintsToComplete,
    };

    res.json({ stories, grouped, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/team/:id/velocity — story points completed per sprint
router.get('/:id/velocity', (req, res) => {
  try {
    const member = db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id);
    if (!member) return res.status(404).json({ error: 'Team member not found' });

    // Points completed per sprint (stories marked Done in that sprint)
    const completedPerSprint = db.prepare(`
      SELECT ssh.sprint,
        COALESCE(SUM(s.story_points), 0) AS points_completed,
        COUNT(*) AS stories_completed
      FROM story_sprint_history ssh
      JOIN stories s ON s.id = ssh.story_id
      WHERE ssh.assignee_id = ? AND ssh.status = 'Done'
      GROUP BY ssh.sprint
      ORDER BY ssh.sprint
    `).all(req.params.id);

    // Carry-over count per sprint (stories seen in sprint that have carry_over_count > 0)
    const carryOversPerSprint = db.prepare(`
      SELECT ssh.sprint,
        COUNT(*) AS carry_over_count
      FROM story_sprint_history ssh
      JOIN stories s ON s.id = ssh.story_id
      WHERE ssh.assignee_id = ? AND ssh.status != 'Done' AND s.carry_over_count > 0
      GROUP BY ssh.sprint
      ORDER BY ssh.sprint
    `).all(req.params.id);

    // Merge into a single dataset
    const sprintMap = {};
    for (const row of completedPerSprint) {
      sprintMap[row.sprint] = {
        sprint: row.sprint,
        points_completed: row.points_completed,
        stories_completed: row.stories_completed,
        carry_over_count: 0,
      };
    }
    for (const row of carryOversPerSprint) {
      if (!sprintMap[row.sprint]) {
        sprintMap[row.sprint] = {
          sprint: row.sprint,
          points_completed: 0,
          stories_completed: 0,
          carry_over_count: 0,
        };
      }
      sprintMap[row.sprint].carry_over_count = row.carry_over_count;
    }

    const velocity = Object.values(sprintMap).sort((a, b) => a.sprint.localeCompare(b.sprint));

    res.json(velocity);
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
