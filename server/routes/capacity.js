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

// GET /api/capacity-plans/:id — full plan, members, leave, and computed totals
router.get('/:id', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const plan = db.prepare(`
      SELECT cp.*, t.name AS team_name
      FROM capacity_plans cp
      LEFT JOIN teams t ON t.id = cp.team_id
      WHERE cp.id = ?
    `).get(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const members = db.prepare(`
      SELECT cpm.*, tm.name AS member_name, tm.role, tm.color,
        (SELECT COUNT(*) FROM team_member_assignments WHERE team_id = ? AND member_id = cpm.member_id) AS still_on_team
      FROM capacity_plan_members cpm
      JOIN team_members tm ON tm.id = cpm.member_id
      WHERE cpm.plan_id = ?
      ORDER BY tm.name
    `).all(plan.team_id, planId);

    const leave = db.prepare(`
      SELECT cl.*, lt.name AS loan_team_name, lp.name AS loan_project_name
      FROM capacity_leave cl
      LEFT JOIN teams lt ON lt.id = cl.loan_team_id
      LEFT JOIN projects lp ON lp.id = cl.loan_project_id
      WHERE cl.plan_id = ?
      ORDER BY cl.member_id, cl.leave_date
    `).all(planId);

    const workingDays = countWeekdays(plan.start_date, plan.end_date);
    const hoursPerPoint = getNumber('capacity_hours_per_point');
    const allocFactor = getNumber('capacity_allocation_factor');

    const leaveByMember = new Map();
    for (const l of leave) {
      if (!leaveByMember.has(l.member_id)) leaveByMember.set(l.member_id, []);
      leaveByMember.get(l.member_id).push(l);
    }

    const memberTotals = members
      .filter((m) => !m.is_excluded)
      .map((m) => {
        const ml = leaveByMember.get(m.member_id) || [];
        const plannedLeave = ml.filter((x) => x.is_planned === 1).length;
        const unplannedLeave = ml.filter((x) => x.is_planned === 0).length;
        const plannedHours = (workingDays - plannedLeave) * 8;
        const actualHours = (workingDays - plannedLeave - unplannedLeave) * 8;
        const theoreticalMax = workingDays * 8;
        return {
          member_id: m.member_id,
          member_name: m.member_name,
          role: m.role,
          color: m.color,
          working_days: workingDays,
          planned_leave_days: plannedLeave,
          unplanned_leave_days: unplannedLeave,
          planned_hours: plannedHours,
          actual_hours: actualHours,
          points: Math.round((actualHours / hoursPerPoint) * 10) / 10,
          required_allocation: Math.round(actualHours * allocFactor),
          utilization_pct: theoreticalMax > 0 ? Math.round((actualHours / theoreticalMax) * 1000) / 10 : 0,
        };
      });

    const teamTotals = memberTotals.reduce(
      (acc, m) => ({
        planned_hours: acc.planned_hours + m.planned_hours,
        actual_hours: acc.actual_hours + m.actual_hours,
        points: Math.round((acc.points + m.points) * 10) / 10,
        required_allocation: acc.required_allocation + m.required_allocation,
        theoretical_max: acc.theoretical_max + m.working_days * 8,
      }),
      { planned_hours: 0, actual_hours: 0, points: 0, required_allocation: 0, theoretical_max: 0 }
    );
    teamTotals.utilization_pct = teamTotals.theoretical_max > 0
      ? Math.round((teamTotals.actual_hours / teamTotals.theoretical_max) * 1000) / 10
      : 0;

    const activeMemberIds = new Set(memberTotals.map((m) => m.member_id));
    const activeLeave = leave.filter((l) => activeMemberIds.has(l.member_id));
    const breakdown = { vacation: 0, holiday: 0, sick: 0, loaned: 0, other: 0 };
    const loanByTeam = {};
    for (const l of activeLeave) {
      breakdown[l.leave_type] = (breakdown[l.leave_type] || 0) + 8;
      if (l.leave_type === 'loaned') {
        const key = l.loan_team_name || 'Unspecified';
        loanByTeam[key] = (loanByTeam[key] || 0) + 8;
      }
    }

    res.json({
      ...plan,
      working_days: workingDays,
      hours_per_point: hoursPerPoint,
      allocation_factor: allocFactor,
      members,
      leave,
      member_totals: memberTotals,
      team_totals: teamTotals,
      leave_breakdown: breakdown,
      loan_by_team: loanByTeam,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/capacity-plans/:id — update plan metadata
router.put('/:id', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(planId);
    if (!existing) return res.status(404).json({ error: 'Plan not found' });

    const name = req.body.name !== undefined ? req.body.name : existing.name;
    const start_date = req.body.start_date !== undefined ? req.body.start_date : existing.start_date;
    const end_date = req.body.end_date !== undefined ? req.body.end_date : existing.end_date;
    const jira_sprint_name = req.body.jira_sprint_name !== undefined
      ? (req.body.jira_sprint_name?.trim() || null)
      : existing.jira_sprint_name;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    if (start_date > end_date) return res.status(400).json({ error: 'start_date must be on or before end_date' });

    const update = db.transaction(() => {
      db.prepare(`
        UPDATE capacity_plans
        SET name = ?, start_date = ?, end_date = ?, jira_sprint_name = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(name.trim(), start_date, end_date, jira_sprint_name, planId);

      db.prepare(`
        DELETE FROM capacity_leave
        WHERE plan_id = ? AND (leave_date < ? OR leave_date > ?)
      `).run(planId, start_date, end_date);
    });

    update();
    const plan = db.prepare('SELECT * FROM capacity_plans WHERE id = ?').get(planId);
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/capacity-plans/:id
router.delete('/:id', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM capacity_plans WHERE id = ?').get(planId);
    if (!existing) return res.status(404).json({ error: 'Plan not found' });
    db.prepare('DELETE FROM capacity_plans WHERE id = ?').run(planId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
