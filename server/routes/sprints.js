const express = require('express');
const router = express.Router();
const db = require('../db/init');

const DONE_STATUSES = ['done', 'closed', 'resolved'];

function isDone(status) {
  return status && DONE_STATUSES.includes(status.toLowerCase());
}

// GET /api/sprints — list all distinct sprints with summary stats
router.get('/', (req, res) => {
  try {
    const teamId = req.query.team_id ? Number(req.query.team_id) : null;

    const teamFilter = teamId
      ? `AND ssh.story_id IN (
          SELECT s.id FROM stories s
          JOIN jira_boards jb ON jb.id = s.jira_board_id
          WHERE jb.team_id = ${teamId}
        )`
      : '';

    // Get distinct sprints ordered by most recent import
    const sprints = db.prepare(`
      SELECT sprint,
        MAX(imported_at) AS last_imported
      FROM story_sprint_history ssh
      WHERE sprint IS NOT NULL AND sprint != ''
      ${teamFilter}
      GROUP BY sprint
      ORDER BY MAX(imported_at) DESC
    `).all();

    // For each sprint, compute stats
    const result = sprints.map(s => {
      const sprintName = s.sprint;

      // All stories that appeared in this sprint
      const allStories = db.prepare(`
        SELECT DISTINCT ssh.story_id, st.status, st.story_points, st.first_seen_sprint, st.carry_over_count
        FROM story_sprint_history ssh
        JOIN stories st ON st.id = ssh.story_id
        ${teamId ? 'JOIN jira_boards jb ON jb.id = st.jira_board_id' : ''}
        WHERE ssh.sprint = ?
        ${teamId ? 'AND jb.team_id = ' + teamId : ''}
      `).all(sprintName);

      let completed = 0;
      let carried_over = 0;
      let new_stories = 0;
      let total_points = 0;
      let completed_points = 0;

      for (const story of allStories) {
        // Get the status at the time of this sprint from history
        const historyEntry = db.prepare(`
          SELECT status FROM story_sprint_history
          WHERE story_id = ? AND sprint = ?
          ORDER BY imported_at DESC LIMIT 1
        `).get(story.story_id, sprintName);

        const storyStatus = historyEntry ? historyEntry.status : story.status;
        const done = isDone(storyStatus);

        if (done) {
          completed++;
          completed_points += story.story_points || 0;
        }

        if (story.first_seen_sprint === sprintName) {
          new_stories++;
        } else {
          carried_over++;
        }

        total_points += story.story_points || 0;
      }

      return {
        sprint: sprintName,
        last_imported: s.last_imported,
        total_stories: allStories.length,
        completed,
        carried_over,
        new_stories,
        total_points,
        completed_points,
        completion_rate: allStories.length > 0 ? Math.round((completed / allStories.length) * 100) : 0,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sprints/:sprintName/stories — all stories for a sprint with details
router.get('/:sprintName/stories', (req, res) => {
  try {
    const sprintName = decodeURIComponent(req.params.sprintName);
    const teamId = req.query.team_id ? Number(req.query.team_id) : null;

    // Get all stories that appeared in this sprint via history
    const stories = db.prepare(`
      SELECT DISTINCT
        st.id, st.key, st.summary, st.status AS current_status, st.story_points,
        st.first_seen_sprint, st.carry_over_count, st.sprints_to_complete,
        st.assignee_id, st.feature_id,
        tm.name AS assignee,
        f.name AS feature_name,
        p.name AS project_name,
        ssh.status AS sprint_status_raw
      FROM story_sprint_history ssh
      JOIN stories st ON st.id = ssh.story_id
      LEFT JOIN team_members tm ON tm.id = st.assignee_id
      LEFT JOIN features f ON f.id = st.feature_id
      LEFT JOIN projects p ON p.id = f.project_id
      ${teamId ? 'JOIN jira_boards jb ON jb.id = st.jira_board_id' : ''}
      WHERE ssh.sprint = ?
      ${teamId ? 'AND jb.team_id = ' + teamId : ''}
      GROUP BY st.id
      ORDER BY st.key
    `).all(sprintName);

    // Determine sprint_status for each story
    const enriched = stories.map(story => {
      // Get the latest history entry status for this sprint
      const historyEntry = db.prepare(`
        SELECT status FROM story_sprint_history
        WHERE story_id = ? AND sprint = ?
        ORDER BY imported_at DESC LIMIT 1
      `).get(story.id, sprintName);

      const statusInSprint = historyEntry ? historyEntry.status : story.current_status;
      const done = isDone(statusInSprint);

      let sprint_status;
      if (done) {
        sprint_status = 'completed';
      } else if (story.first_seen_sprint === sprintName) {
        sprint_status = 'new';
      } else {
        sprint_status = 'carried_over';
      }

      return {
        id: story.id,
        key: story.key,
        summary: story.summary,
        status: statusInSprint,
        story_points: story.story_points,
        assignee: story.assignee,
        feature_name: story.feature_name,
        project_name: story.project_name,
        carry_over_count: story.carry_over_count,
        sprints_to_complete: story.sprints_to_complete,
        first_seen_sprint: story.first_seen_sprint,
        sprint_status,
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
