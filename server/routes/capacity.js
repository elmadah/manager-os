const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { countWeekdays } = require('../lib/capacityDates');
const { getNumber } = require('../lib/appSettings');

// GET /api/capacity-plans?team_id= — list plans with summary stats
router.get('/', (req, res) => {
  try {
    const teamId = req.query.team_id ? Number(req.query.team_id) : null;
    const where = teamId ? 'WHERE cp.team_id = ?' : '';
    const params = teamId ? [teamId] : [];

    const plans = db.prepare(`
      SELECT cp.*, t.name AS team_name,
        (SELECT COUNT(*) FROM capacity_plan_members WHERE plan_id = cp.id AND is_excluded = 0) AS active_member_count
      FROM capacity_plans cp
      LEFT JOIN teams t ON t.id = cp.team_id
      ${where}
      ORDER BY cp.start_date DESC
    `).all(...params);

    const hoursPerPoint = getNumber('capacity_hours_per_point');
    const allocFactor = getNumber('capacity_allocation_factor');

    const enriched = plans.map((plan) => {
      const workingDays = countWeekdays(plan.start_date, plan.end_date);

      const leaveCounts = db.prepare(`
        SELECT
          SUM(CASE WHEN is_planned = 1 THEN 1 ELSE 0 END) AS planned,
          SUM(CASE WHEN is_planned = 0 THEN 1 ELSE 0 END) AS unplanned
        FROM capacity_leave cl
        WHERE cl.plan_id = ?
          AND cl.member_id IN (
            SELECT member_id FROM capacity_plan_members
            WHERE plan_id = ? AND is_excluded = 0
          )
      `).get(plan.id, plan.id);

      const memberCount = plan.active_member_count || 0;
      const totalWorkingHours = memberCount * workingDays * 8;
      const plannedLeaveHours = (leaveCounts?.planned || 0) * 8;
      const unplannedLeaveHours = (leaveCounts?.unplanned || 0) * 8;
      const plannedHours = totalWorkingHours - plannedLeaveHours;
      const actualHours = plannedHours - unplannedLeaveHours;
      const utilizationPct = totalWorkingHours > 0 ? (actualHours / totalWorkingHours) * 100 : 0;

      return {
        ...plan,
        working_days: workingDays,
        planned_hours: plannedHours,
        actual_hours: actualHours,
        total_points: Math.round((actualHours / hoursPerPoint) * 10) / 10,
        required_allocation: Math.round(actualHours * allocFactor),
        utilization_pct: Math.round(utilizationPct * 10) / 10,
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/capacity-plans — create plan; auto-populate members from team
router.post('/', (req, res) => {
  try {
    const { name, team_id, start_date, end_date, jira_sprint_name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!team_id) return res.status(400).json({ error: 'team_id is required' });
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' });
    if (start_date > end_date) return res.status(400).json({ error: 'start_date must be on or before end_date' });

    const team = db.prepare('SELECT id FROM teams WHERE id = ?').get(Number(team_id));
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const create = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO capacity_plans (name, team_id, start_date, end_date, jira_sprint_name)
        VALUES (?, ?, ?, ?, ?)
      `).run(name.trim(), Number(team_id), start_date, end_date, jira_sprint_name?.trim() || null);

      const planId = result.lastInsertRowid;

      const members = db.prepare(
        'SELECT member_id FROM team_member_assignments WHERE team_id = ?'
      ).all(Number(team_id));

      for (const m of members) {
        db.prepare(
          'INSERT OR IGNORE INTO capacity_plan_members (plan_id, member_id) VALUES (?, ?)'
        ).run(planId, m.member_id);
      }

      return planId;
    });

    const planId = create();
    const plan = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(planId);
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
