const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/timeline?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
router.get('/', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }

    // Get all features that overlap with the date range, along with their
    // project info and assignees (derived from stories)
    const rows = db.prepare(`
      SELECT
        tm.id AS member_id,
        tm.name AS member_name,
        tm.role AS member_role,
        p.id AS project_id,
        p.name AS project_name,
        p.color AS project_color,
        p.start_date AS project_start_date,
        p.target_date AS project_target_date,
        f.id AS feature_id,
        f.name AS feature_name,
        f.status AS feature_status,
        f.start_date AS feature_start_date,
        f.target_date AS feature_target_date
      FROM team_members tm
      JOIN stories s ON s.assignee_id = tm.id
      JOIN features f ON f.id = s.feature_id
      JOIN projects p ON p.id = f.project_id
      WHERE f.start_date IS NOT NULL
        AND f.target_date IS NOT NULL
        AND f.target_date >= ?
        AND f.start_date <= ?
      GROUP BY tm.id, f.id
      ORDER BY tm.name, p.name, f.start_date
    `).all(start_date, end_date);

    // Also get assignees for each feature (all assignees, not just the current member)
    const featureIds = [...new Set(rows.map(r => r.feature_id))];
    const assigneeMap = {};
    if (featureIds.length > 0) {
      const placeholders = featureIds.map(() => '?').join(',');
      const assigneeRows = db.prepare(`
        SELECT DISTINCT s.feature_id, tm.id, tm.name
        FROM stories s
        JOIN team_members tm ON tm.id = s.assignee_id
        WHERE s.feature_id IN (${placeholders})
      `).all(...featureIds);

      for (const ar of assigneeRows) {
        if (!assigneeMap[ar.feature_id]) assigneeMap[ar.feature_id] = [];
        assigneeMap[ar.feature_id].push({ id: ar.id, name: ar.name });
      }
    }

    // Group by team member → project → features
    const memberMap = new Map();
    for (const row of rows) {
      if (!memberMap.has(row.member_id)) {
        memberMap.set(row.member_id, {
          id: row.member_id,
          name: row.member_name,
          role: row.member_role,
          projects: new Map(),
        });
      }
      const member = memberMap.get(row.member_id);

      if (!member.projects.has(row.project_id)) {
        member.projects.set(row.project_id, {
          id: row.project_id,
          name: row.project_name,
          color: row.project_color || '#3B82F6',
          start_date: row.project_start_date,
          target_date: row.project_target_date,
          features: [],
        });
      }
      const project = member.projects.get(row.project_id);

      project.features.push({
        id: row.feature_id,
        name: row.feature_name,
        status: row.feature_status,
        start_date: row.feature_start_date,
        target_date: row.feature_target_date,
        assignees: assigneeMap[row.feature_id] || [],
      });
    }

    // Convert maps to arrays
    const team_members = Array.from(memberMap.values()).map(m => ({
      ...m,
      projects: Array.from(m.projects.values()),
    }));

    // Also include team members with no features in range
    const allMembers = db.prepare('SELECT id, name, role FROM team_members ORDER BY name').all();
    for (const m of allMembers) {
      if (!memberMap.has(m.id)) {
        team_members.push({ id: m.id, name: m.name, role: m.role, projects: [] });
      }
    }
    team_members.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      team_members,
      date_range: { start: start_date, end: end_date },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
