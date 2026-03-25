const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/init');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSettings() {
  return db.prepare('SELECT * FROM jira_settings WHERE id = ?').get('default');
}

function maskToken(token) {
  if (!token || token.length < 8) return '****';
  return token.slice(0, 4) + '****' + token.slice(-4);
}

function jiraFetch(path, settings) {
  const url = `${settings.base_url.replace(/\/+$/, '')}${path}`;
  const parsed = new URL(url);
  const transport = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${settings.pat_token}`,
          Accept: 'application/json',
        },
        rejectUnauthorized: false,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`Jira API error: ${res.statusCode} ${res.statusMessage}`);
            error.status = res.statusCode;
            return reject(error);
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid JSON response from Jira'));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Settings CRUD
// ---------------------------------------------------------------------------

// GET /api/settings/jira — get config (PAT masked)
router.get('/', (req, res) => {
  try {
    const settings = getSettings();
    const boards = db.prepare('SELECT * FROM jira_boards ORDER BY created_at').all();
    if (!settings) {
      return res.json({ configured: false, boards });
    }
    res.json({
      configured: true,
      base_url: settings.base_url,
      pat_token: maskToken(settings.pat_token),
      story_points_field: settings.story_points_field,
      boards,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/jira — save/update config
router.put('/', (req, res) => {
  try {
    const { base_url, pat_token, story_points_field } = req.body;
    if (!base_url || !pat_token) {
      return res.status(400).json({ error: 'base_url and pat_token are required' });
    }
    const existing = getSettings();
    if (existing) {
      db.prepare(
        `UPDATE jira_settings SET base_url = ?, pat_token = ?, story_points_field = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(base_url.replace(/\/+$/, ''), pat_token, story_points_field || 'customfield_10026', 'default');
    } else {
      db.prepare(
        `INSERT INTO jira_settings (id, base_url, pat_token, story_points_field) VALUES (?, ?, ?, ?)`
      ).run('default', base_url.replace(/\/+$/, ''), pat_token, story_points_field || 'customfield_10026');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/jira/test — test connection
router.post('/test', async (req, res) => {
  try {
    const settings = getSettings();
    if (!settings) {
      return res.status(400).json({ error: 'Jira is not configured yet' });
    }
    const user = await jiraFetch('/rest/api/2/myself', settings);
    res.json({ success: true, user: user.displayName });
  } catch (err) {
    const status = err.status || 500;
    const message =
      status === 401
        ? 'Authentication failed. Check your PAT token.'
        : status === 404
          ? 'Jira not found at this URL. Check the base URL.'
          : `Connection failed: ${err.message}`;
    res.status(status).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Boards CRUD
// ---------------------------------------------------------------------------

// POST /api/settings/jira/boards — add a board
router.post('/boards', (req, res) => {
  try {
    const { board_id, label } = req.body;
    if (!board_id || !label) {
      return res.status(400).json({ error: 'board_id and label are required' });
    }
    const id = uuidv4();
    db.prepare('INSERT INTO jira_boards (id, board_id, label) VALUES (?, ?, ?)').run(
      id,
      parseInt(board_id, 10),
      label
    );
    res.json({ id, board_id: parseInt(board_id, 10), label });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/settings/jira/boards/:id — remove a board
router.delete('/boards/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM jira_boards WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

// In-memory preview store (same pattern as import.js)
const syncPreviewStore = new Map();

function cleanupSyncPreviews() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, entry] of syncPreviewStore) {
    if (entry.createdAt < oneHourAgo) {
      syncPreviewStore.delete(id);
    }
  }
}
setInterval(cleanupSyncPreviews, 10 * 60 * 1000);

// GET /api/settings/jira/boards/:id/sync — preview
router.get('/boards/:id/sync', async (req, res) => {
  try {
    const settings = getSettings();
    if (!settings) {
      return res.status(400).json({ error: 'Jira is not configured yet' });
    }

    const board = db.prepare('SELECT * FROM jira_boards WHERE id = ?').get(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // 1. Get active sprint
    const sprintData = await jiraFetch(
      `/rest/agile/1.0/board/${board.board_id}/sprint?state=active`,
      settings
    );

    if (!sprintData.values || sprintData.values.length === 0) {
      return res.status(404).json({ error: 'No active sprint found for this board' });
    }

    const activeSprint = sprintData.values[0];

    // 2. Fetch all issues (paginated)
    const storyPointsField = settings.story_points_field || 'customfield_10026';
    let startAt = 0;
    const maxResults = 50;
    let allIssues = [];

    while (true) {
      const issueData = await jiraFetch(
        `/rest/agile/1.0/board/${board.board_id}/sprint/${activeSprint.id}/issue?maxResults=${maxResults}&startAt=${startAt}&fields=summary,status,assignee,${storyPointsField},issuetype,sprint,customfield_10008`,
        settings
      );

      const issues = (issueData.issues || []).filter((issue) => {
        const typeName = issue.fields?.issuetype?.name?.toLowerCase() || '';
        return typeName === 'story' || typeName === 'bug' || typeName === 'defect';
      });

      allIssues = allIssues.concat(issues);
      if (startAt + maxResults >= issueData.total) break;
      startAt += maxResults;
    }

    // 3. Map to our format
    const teamMembers = db.prepare('SELECT id, name FROM team_members').all();
    const memberMap = new Map();
    for (const m of teamMembers) {
      memberMap.set(m.name.toLowerCase(), m.id);
    }

    const mappedIssues = allIssues.map((issue) => {
      const assigneeName = issue.fields?.assignee?.displayName || null;
      const epicField = issue.fields?.customfield_10008 || null;

      return {
        key: issue.key,
        summary: issue.fields?.summary || '',
        sprint: activeSprint.name,
        status: issue.fields?.status?.name || '',
        assignee_name: assigneeName,
        assignee_id: assigneeName ? memberMap.get(assigneeName.toLowerCase()) || null : null,
        story_points: issue.fields?.[storyPointsField] || 0,
        issue_type: issue.fields?.issuetype?.name || '',
        epic_key: epicField || null,
        epic_name: null, // Epic name would require a separate API call
      };
    });

    // 4. Compute diff against existing stories
    const updated = [];
    const newStories = [];

    for (const issue of mappedIssues) {
      const existing = db.prepare('SELECT * FROM stories WHERE key = ?').get(issue.key);
      if (existing) {
        const changes = {};
        if (existing.status !== issue.status) changes.status = { from: existing.status, to: issue.status };
        if (existing.story_points !== issue.story_points) changes.story_points = { from: existing.story_points, to: issue.story_points };
        if (existing.sprint !== issue.sprint) changes.sprint = { from: existing.sprint, to: issue.sprint };
        if (existing.assignee_id !== issue.assignee_id) changes.assignee = { from: existing.assignee_id, to: issue.assignee_id };

        updated.push({
          ...issue,
          existing_id: existing.id,
          feature_id: existing.feature_id,
          changes,
          has_changes: Object.keys(changes).length > 0,
        });
      } else {
        newStories.push(issue);
      }
    }

    // 5. Store preview
    const previewId = uuidv4();
    syncPreviewStore.set(previewId, {
      createdAt: Date.now(),
      boardId: board.id,
      sprintName: activeSprint.name,
      updated,
      newStories,
    });

    // 6. Get projects + features for the assignment UI
    const projects = db.prepare('SELECT id, name FROM projects ORDER BY name').all();
    const features = db.prepare('SELECT id, name, project_id FROM features ORDER BY name').all();

    res.json({
      preview_id: previewId,
      sprint_name: activeSprint.name,
      updated: updated.filter((u) => u.has_changes),
      updated_count: updated.filter((u) => u.has_changes).length,
      unchanged_count: updated.filter((u) => !u.has_changes).length,
      new_stories: newStories,
      projects,
      features,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/settings/jira/boards/:id/sync — confirm
router.post('/boards/:id/sync', (req, res) => {
  try {
    const { preview_id, assignments } = req.body;
    // assignments = [{ key, project_id, feature_id }, ...]

    if (!preview_id) {
      return res.status(400).json({ error: 'preview_id is required' });
    }

    const preview = syncPreviewStore.get(preview_id);
    if (!preview) {
      return res.status(404).json({ error: 'Preview not found or expired' });
    }

    const board = db.prepare('SELECT * FROM jira_boards WHERE id = ?').get(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const assignmentMap = new Map();
    for (const a of assignments || []) {
      assignmentMap.set(a.key, { project_id: a.project_id, feature_id: a.feature_id });
    }

    const insertStory = db.prepare(`
      INSERT INTO stories (key, summary, sprint, status, assignee_id, story_points, feature_id, first_seen_sprint, carry_over_count, jira_board_id, epic_key, epic_name, issue_type, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const updateStory = db.prepare(`
      UPDATE stories SET summary = ?, sprint = ?, status = ?, assignee_id = ?, story_points = ?,
        epic_key = ?, epic_name = ?, issue_type = ?, jira_board_id = ?, last_synced_at = datetime('now'),
        updated_at = datetime('now')
      WHERE key = ?
    `);

    const incrementCarryOver = db.prepare(`
      UPDATE stories SET carry_over_count = carry_over_count + 1 WHERE key = ?
    `);

    const insertHistory = db.prepare(`
      INSERT INTO story_sprint_history (story_id, sprint, status, assignee_id)
      VALUES (?, ?, ?, ?)
    `);

    const getStory = db.prepare('SELECT id, sprint FROM stories WHERE key = ?');

    let updatedCount = 0;
    let newCount = 0;

    const applySync = db.transaction(() => {
      // Update existing stories
      for (const item of preview.updated) {
        if (!item.has_changes) continue;

        const existing = getStory.get(item.key);
        if (existing && existing.sprint !== item.sprint) {
          incrementCarryOver.run(item.key);
        }

        updateStory.run(
          item.summary, item.sprint, item.status, item.assignee_id, item.story_points,
          item.epic_key, item.epic_name, item.issue_type, preview.boardId,
          item.key
        );

        const story = getStory.get(item.key);
        insertHistory.run(story.id, item.sprint, item.status, item.assignee_id);
        updatedCount++;
      }

      // Insert new stories
      for (const item of preview.newStories) {
        const assignment = assignmentMap.get(item.key) || {};
        const result = insertStory.run(
          item.key, item.summary, item.sprint, item.status, item.assignee_id,
          item.story_points, assignment.feature_id || null, item.sprint, 0,
          preview.boardId, item.epic_key, item.epic_name, item.issue_type
        );
        insertHistory.run(result.lastInsertRowid, item.sprint, item.status, item.assignee_id);

        // Save project mapping for future defaults
        if (assignment.project_id) {
          const jiraProjectKey = item.key.replace(/-\d+$/, '');
          const existingMapping = db.prepare('SELECT id FROM jira_project_mappings WHERE jira_project_key = ?').get(jiraProjectKey);
          if (!existingMapping) {
            db.prepare('INSERT INTO jira_project_mappings (id, jira_project_key, project_id) VALUES (?, ?, ?)').run(
              uuidv4(), jiraProjectKey, assignment.project_id
            );
          }
        }

        newCount++;
      }
    });

    applySync();
    syncPreviewStore.delete(preview_id);

    res.json({
      success: true,
      sprint_name: preview.sprintName,
      updated_count: updatedCount,
      new_count: newCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Story Statuses
// ---------------------------------------------------------------------------

// GET /api/settings/jira/statuses — return imported story statuses
router.get('/statuses', (req, res) => {
  try {
    const statuses = db
      .prepare('SELECT * FROM story_statuses ORDER BY display_order, name')
      .all();
    res.json(statuses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/jira/import-statuses — fetch statuses from Jira and replace local table
router.post('/import-statuses', async (req, res) => {
  try {
    const settings = getSettings();
    if (!settings) {
      return res.status(400).json({ error: 'Jira is not configured yet' });
    }

    // Fetch all statuses from the Jira instance
    const jiraStatuses = await jiraFetch('/rest/api/2/status', settings);

    if (!Array.isArray(jiraStatuses) || jiraStatuses.length === 0) {
      return res.status(404).json({ error: 'No statuses found in Jira' });
    }

    // Deduplicate by name, keeping the category from Jira's statusCategory
    const seen = new Map();
    for (const s of jiraStatuses) {
      const name = s.name;
      const category = s.statusCategory?.key || 'indeterminate';
      if (!seen.has(name)) {
        seen.set(name, category);
      }
    }

    // Order: new (To Do) first, then indeterminate (In Progress), then done
    const categoryOrder = { new: 0, indeterminate: 1, done: 2 };
    const sorted = [...seen.entries()].sort((a, b) => {
      const orderA = categoryOrder[a[1]] ?? 1;
      const orderB = categoryOrder[b[1]] ?? 1;
      if (orderA !== orderB) return orderA - orderB;
      return a[0].localeCompare(b[0]);
    });

    // Replace table contents in a transaction
    const replaceStatuses = db.transaction(() => {
      db.prepare('DELETE FROM story_statuses').run();
      const insert = db.prepare(
        'INSERT INTO story_statuses (name, category, display_order) VALUES (?, ?, ?)'
      );
      sorted.forEach(([name, category], index) => {
        insert.run(name, category, index);
      });
    });

    replaceStatuses();

    // Return the imported list
    const statuses = db
      .prepare('SELECT * FROM story_statuses ORDER BY display_order, name')
      .all();

    res.json({ success: true, count: statuses.length, statuses });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
