const db = require('../db/init');

/**
 * Generate a weekly digest summarizing activity between two dates.
 * @param {string} fromDate - ISO date string (inclusive)
 * @param {string} toDate - ISO date string (inclusive)
 * @returns {object} Structured digest data
 */
function generateWeeklyDigest(fromDate, toDate) {
  // Stories completed in the period, grouped by project
  const completedStories = db.prepare(`
    SELECT s.key, s.summary, s.status, s.story_points, s.sprint,
           s.carry_over_count, s.sprints_to_complete,
           f.name AS feature_name,
           p.id AS project_id, p.name AS project_name
    FROM stories s
    LEFT JOIN features f ON s.feature_id = f.id
    LEFT JOIN projects p ON f.project_id = p.id
    WHERE LOWER(s.status) IN ('done', 'closed', 'resolved')
      AND s.updated_at >= ? AND s.updated_at <= ?
    ORDER BY p.name, f.name, s.key
  `).all(fromDate, toDate + 'T23:59:59');

  const completedByProject = {};
  for (const story of completedStories) {
    const projectName = story.project_name || 'Unassigned';
    if (!completedByProject[projectName]) {
      completedByProject[projectName] = [];
    }
    completedByProject[projectName].push(story);
  }

  // Stories that carried over (still open, carry_over_count > 0)
  const carriedOverStories = db.prepare(`
    SELECT s.key, s.summary, s.status, s.sprint, s.carry_over_count,
           s.story_points, s.first_seen_sprint,
           f.name AS feature_name,
           p.name AS project_name,
           tm.name AS assignee_name
    FROM stories s
    LEFT JOIN features f ON s.feature_id = f.id
    LEFT JOIN projects p ON f.project_id = p.id
    LEFT JOIN team_members tm ON s.assignee_id = tm.id
    WHERE LOWER(s.status) NOT IN ('done', 'closed', 'resolved')
      AND s.carry_over_count > 0
    ORDER BY s.carry_over_count DESC, p.name
  `).all();

  // New blockers raised in the period
  const newBlockers = db.prepare(`
    SELECT b.id, b.title, b.description, b.severity, b.status,
           p.name AS project_name,
           f.name AS feature_name,
           tm.name AS reported_by
    FROM blockers b
    LEFT JOIN projects p ON b.project_id = p.id
    LEFT JOIN features f ON b.feature_id = f.id
    LEFT JOIN team_members tm ON b.team_member_id = tm.id
    WHERE b.created_at >= ? AND b.created_at <= ?
    ORDER BY
      CASE b.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
  `).all(fromDate, toDate + 'T23:59:59');

  // Blockers resolved in the period
  const resolvedBlockers = db.prepare(`
    SELECT b.id, b.title, b.severity,
           p.name AS project_name,
           b.resolved_at
    FROM blockers b
    LEFT JOIN projects p ON b.project_id = p.id
    WHERE b.status = 'resolved'
      AND b.resolved_at >= ? AND b.resolved_at <= ?
    ORDER BY b.resolved_at
  `).all(fromDate, toDate + 'T23:59:59');

  // Upcoming target dates (projects with target_date within next 2 weeks from toDate)
  const twoWeeksOut = new Date(toDate);
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);
  const twoWeeksOutStr = twoWeeksOut.toISOString().split('T')[0];

  const upcomingDeadlines = db.prepare(`
    SELECT p.id, p.name, p.status, p.health, p.target_date,
           (SELECT COUNT(*) FROM features f
            JOIN stories s ON s.feature_id = f.id
            WHERE f.project_id = p.id
              AND LOWER(s.status) NOT IN ('done', 'closed', 'resolved')) AS open_stories
    FROM projects p
    WHERE p.target_date IS NOT NULL
      AND p.target_date >= ?
      AND p.target_date <= ?
      AND p.status != 'complete'
    ORDER BY p.target_date
  `).all(toDate, twoWeeksOutStr);

  // Todos completed in the period
  const completedTodos = db.prepare(`
    SELECT t.id, t.title, t.priority, t.due_date,
           p.name AS project_name,
           tm.name AS assigned_to
    FROM todos t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN team_members tm ON t.team_member_id = tm.id
    WHERE t.is_complete = 1
      AND t.updated_at >= ? AND t.updated_at <= ?
    ORDER BY t.updated_at
  `).all(fromDate, toDate + 'T23:59:59');

  // Todos overdue (due_date before toDate, not complete)
  const overdueTodos = db.prepare(`
    SELECT t.id, t.title, t.priority, t.due_date,
           p.name AS project_name,
           tm.name AS assigned_to
    FROM todos t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN team_members tm ON t.team_member_id = tm.id
    WHERE t.is_complete = 0
      AND t.due_date IS NOT NULL
      AND t.due_date < ?
    ORDER BY t.due_date
  `).all(toDate);

  return {
    period: { from: fromDate, to: toDate },
    completedStories: completedByProject,
    completedStoriesCount: completedStories.length,
    totalPointsCompleted: completedStories.reduce((sum, s) => sum + (s.story_points || 0), 0),
    carriedOverStories,
    newBlockers,
    resolvedBlockers,
    upcomingDeadlines,
    completedTodos,
    overdueTodos,
  };
}

/**
 * Format a digest object as a markdown document.
 * @param {object} digest - Output from generateWeeklyDigest
 * @returns {string} Markdown-formatted digest
 */
function formatDigestAsMarkdown(digest) {
  const lines = [];
  const { period } = digest;

  lines.push(`# Weekly Digest: ${period.from} to ${period.to}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Stories completed:** ${digest.completedStoriesCount} (${digest.totalPointsCompleted} points)`);
  lines.push(`- **Stories carried over:** ${digest.carriedOverStories.length}`);
  lines.push(`- **New blockers:** ${digest.newBlockers.length}`);
  lines.push(`- **Blockers resolved:** ${digest.resolvedBlockers.length}`);
  lines.push(`- **Todos completed:** ${digest.completedTodos.length}`);
  lines.push(`- **Todos overdue:** ${digest.overdueTodos.length}`);
  lines.push('');

  // Completed stories by project
  lines.push('## Stories Completed');
  lines.push('');
  const projects = Object.keys(digest.completedStories);
  if (projects.length === 0) {
    lines.push('_No stories completed this period._');
    lines.push('');
  } else {
    for (const projectName of projects) {
      const stories = digest.completedStories[projectName];
      const points = stories.reduce((sum, s) => sum + (s.story_points || 0), 0);
      lines.push(`### ${projectName} (${stories.length} stories, ${points} pts)`);
      lines.push('');
      for (const s of stories) {
        const feature = s.feature_name ? ` [${s.feature_name}]` : '';
        const pts = s.story_points ? ` (${s.story_points} pts)` : '';
        lines.push(`- **${s.key}** ${s.summary}${feature}${pts}`);
      }
      lines.push('');
    }
  }

  // Carried over stories
  lines.push('## Carried Over Stories');
  lines.push('');
  if (digest.carriedOverStories.length === 0) {
    lines.push('_No stories currently carried over._');
    lines.push('');
  } else {
    for (const s of digest.carriedOverStories) {
      const project = s.project_name ? ` (${s.project_name})` : '';
      const assignee = s.assignee_name ? ` — ${s.assignee_name}` : '';
      lines.push(`- **${s.key}** ${s.summary}${project}${assignee}`);
      lines.push(`  - Carried over ${s.carry_over_count}x | Sprint: ${s.sprint} | Status: ${s.status}`);
    }
    lines.push('');
  }

  // New blockers
  lines.push('## New Blockers');
  lines.push('');
  if (digest.newBlockers.length === 0) {
    lines.push('_No new blockers this period._');
    lines.push('');
  } else {
    for (const b of digest.newBlockers) {
      const project = b.project_name ? ` (${b.project_name})` : '';
      const severity = b.severity.toUpperCase();
      lines.push(`- **[${severity}]** ${b.title}${project}`);
      if (b.description) {
        lines.push(`  - ${b.description}`);
      }
    }
    lines.push('');
  }

  // Resolved blockers
  lines.push('## Blockers Resolved');
  lines.push('');
  if (digest.resolvedBlockers.length === 0) {
    lines.push('_No blockers resolved this period._');
    lines.push('');
  } else {
    for (const b of digest.resolvedBlockers) {
      const project = b.project_name ? ` (${b.project_name})` : '';
      lines.push(`- ${b.title}${project} — resolved ${b.resolved_at}`);
    }
    lines.push('');
  }

  // Upcoming deadlines
  lines.push('## Upcoming Deadlines (Next 2 Weeks)');
  lines.push('');
  if (digest.upcomingDeadlines.length === 0) {
    lines.push('_No upcoming project deadlines._');
    lines.push('');
  } else {
    for (const p of digest.upcomingDeadlines) {
      const health = p.health ? ` | Health: ${p.health}` : '';
      lines.push(`- **${p.name}** — target: ${p.target_date}${health}`);
      lines.push(`  - Status: ${p.status} | Open stories: ${p.open_stories}`);
    }
    lines.push('');
  }

  // Completed todos
  lines.push('## Todos Completed');
  lines.push('');
  if (digest.completedTodos.length === 0) {
    lines.push('_No todos completed this period._');
    lines.push('');
  } else {
    for (const t of digest.completedTodos) {
      const project = t.project_name ? ` (${t.project_name})` : '';
      const assignee = t.assigned_to ? ` — ${t.assigned_to}` : '';
      lines.push(`- ${t.title}${project}${assignee}`);
    }
    lines.push('');
  }

  // Overdue todos
  lines.push('## Overdue Todos');
  lines.push('');
  if (digest.overdueTodos.length === 0) {
    lines.push('_No overdue todos._');
    lines.push('');
  } else {
    for (const t of digest.overdueTodos) {
      const project = t.project_name ? ` (${t.project_name})` : '';
      const assignee = t.assigned_to ? ` — ${t.assigned_to}` : '';
      const priority = t.priority ? ` [${t.priority}]` : '';
      lines.push(`- ${t.title}${priority}${project}${assignee} — due: ${t.due_date}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = { generateWeeklyDigest, formatDigestAsMarkdown };
