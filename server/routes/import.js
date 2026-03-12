const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/init');
const { computeDiff, isDone } = require('../services/sprintDiff');

const upload = multer({ storage: multer.memoryStorage() });

// In-memory preview store with 1-hour TTL
const previewStore = new Map();

function cleanupPreviews() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, entry] of previewStore) {
    if (entry.createdAt < oneHourAgo) {
      previewStore.delete(id);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupPreviews, 10 * 60 * 1000);

/**
 * Map a raw row's columns (case-insensitive) to our standard field names.
 */
function normalizeRow(raw) {
  const get = (keys) => {
    for (const k of keys) {
      for (const rawKey of Object.keys(raw)) {
        if (rawKey.toLowerCase() === k.toLowerCase()) {
          return raw[rawKey];
        }
      }
    }
    return null;
  };

  // Parse comma-separated sprints from Jira (e.g. "Sprint 1, Sprint 2, Sprint 3")
  const rawSprint = get(['Sprint', 'sprint']);
  let sprint = rawSprint;
  let all_sprints = [];
  if (rawSprint) {
    all_sprints = rawSprint.split(',').map(s => s.trim()).filter(Boolean);
    sprint = all_sprints[all_sprints.length - 1]; // last sprint = current
  }

  return {
    key: get(['Issue key', 'key']),
    summary: get(['Summary', 'summary']),
    sprint,
    all_sprints,
    sprint_count: all_sprints.length,
    status: get(['Status', 'status']),
    assignee: get(['Assignee', 'assignee']),
    story_points: parseInt(get(['Story Points', 'Story point estimate', 'story_points']), 10) || 0,
    release_date: get(['Resolved', 'Release Date', 'release_date']) || null,
  };
}

/**
 * Match assignee names to team_members (case-insensitive).
 */
function resolveAssignees(rows) {
  const members = db.prepare('SELECT id, name FROM team_members').all();
  const memberMap = new Map();
  for (const m of members) {
    memberMap.set(m.name.toLowerCase(), m.id);
  }

  return rows.map(row => ({
    ...row,
    assignee_id: row.assignee ? (memberMap.get(row.assignee.toLowerCase()) || null) : null,
  }));
}

/**
 * Parse CSV buffer into array of normalized rows.
 */
function parseCsv(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(csv())
      .on('data', (data) => rows.push(normalizeRow(data)))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

// POST /api/import — Upload and preview
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let rows;
    const filename = req.file.originalname.toLowerCase();

    if (filename.endsWith('.json')) {
      const data = JSON.parse(req.file.buffer.toString('utf-8'));
      if (!Array.isArray(data)) {
        return res.status(400).json({ error: 'JSON must be an array of objects' });
      }
      rows = data.map(normalizeRow);
    } else if (filename.endsWith('.csv')) {
      rows = await parseCsv(req.file.buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use CSV or JSON.' });
    }

    // Filter out rows without a key
    rows = rows.filter(r => r.key);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid rows found in file' });
    }

    // Resolve assignees
    rows = resolveAssignees(rows);

    // Compute diff
    const preview = computeDiff(rows);

    // Summarize
    const summary = { new: 0, updated: 0, carry_over: 0, closed: 0, unchanged: 0 };
    for (const row of preview) {
      summary[row.diff_status]++;
    }

    // Store preview for confirm step
    const importId = uuidv4();
    previewStore.set(importId, { rows: preview, createdAt: Date.now() });

    res.json({ import_id: importId, preview, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/confirm — Apply the import
router.post('/confirm', (req, res) => {
  try {
    const { import_id, feature_assignments } = req.body;
    if (!import_id) {
      return res.status(400).json({ error: 'import_id is required' });
    }

    const entry = previewStore.get(import_id);
    if (!entry) {
      return res.status(404).json({ error: 'Preview not found or expired' });
    }

    // feature_assignments is { story_key: feature_id }
    const featureMap = feature_assignments || {};

    const rows = entry.rows;
    let imported = 0;
    const summary = { new: 0, updated: 0, carry_over: 0, closed: 0, unchanged: 0 };

    const insertStory = db.prepare(`
      INSERT INTO stories (key, summary, sprint, status, assignee_id, story_points, release_date, first_seen_sprint, carry_over_count, feature_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStory = db.prepare(`
      UPDATE stories SET summary = ?, sprint = ?, status = ?, assignee_id = ?, story_points = ?, updated_at = datetime('now')
      WHERE key = ?
    `);

    const incrementCarryOver = db.prepare(`
      UPDATE stories SET sprint = ?, carry_over_count = carry_over_count + 1, updated_at = datetime('now')
      WHERE key = ?
    `);

    const closeStory = db.prepare(`
      UPDATE stories SET status = ?, release_date = ?, sprints_to_complete = ?, updated_at = datetime('now')
      WHERE key = ?
    `);

    const insertHistory = db.prepare(`
      INSERT INTO story_sprint_history (story_id, sprint, status, assignee_id)
      VALUES (?, ?, ?, ?)
    `);

    const getStory = db.prepare('SELECT id FROM stories WHERE key = ?');

    const updateFeature = db.prepare('UPDATE stories SET feature_id = ?, updated_at = datetime(\'now\') WHERE key = ?');

    const getSprintCount = db.prepare(
      'SELECT COUNT(DISTINCT sprint) as cnt FROM story_sprint_history WHERE story_id = ?'
    );

    const applyImport = db.transaction(() => {
      for (const row of rows) {
        summary[row.diff_status]++;

        if (row.diff_status === 'unchanged') {
          // Still apply feature assignment if provided
          const unchangedFeatureId = featureMap[row.key] || null;
          if (unchangedFeatureId) updateFeature.run(unchangedFeatureId, row.key);
          continue;
        }

        const featureId = featureMap[row.key] || null;

        if (row.diff_status === 'new') {
          const carryOverCount = Math.max(0, (row.sprint_count || 1) - 1);
          const firstSprint = row.all_sprints.length > 0 ? row.all_sprints[0] : row.sprint;
          const result = insertStory.run(
            row.key, row.summary, row.sprint, row.status,
            row.assignee_id, row.story_points, row.release_date, firstSprint, carryOverCount, featureId
          );
          // Insert history entries for all sprints the story was part of
          for (const sp of (row.all_sprints.length > 0 ? row.all_sprints : [row.sprint])) {
            insertHistory.run(result.lastInsertRowid, sp, row.status, row.assignee_id);
          }
          imported++;
        } else if (row.diff_status === 'updated') {
          updateStory.run(row.summary, row.sprint, row.status, row.assignee_id, row.story_points, row.key);
          if (featureId) updateFeature.run(featureId, row.key);
          const story = getStory.get(row.key);
          insertHistory.run(story.id, row.sprint, row.status, row.assignee_id);
          imported++;
        } else if (row.diff_status === 'carry_over') {
          incrementCarryOver.run(row.sprint, row.key);
          updateStory.run(row.summary, row.sprint, row.status, row.assignee_id, row.story_points, row.key);
          if (featureId) updateFeature.run(featureId, row.key);
          const story = getStory.get(row.key);
          insertHistory.run(story.id, row.sprint, row.status, row.assignee_id);
          imported++;
        } else if (row.diff_status === 'closed') {
          const story = getStory.get(row.key);
          const sprintCount = getSprintCount.get(story.id);
          const sprintsToComplete = sprintCount.cnt + 1; // +1 for current sprint
          const releaseDate = row.release_date || new Date().toISOString().split('T')[0];
          closeStory.run(row.status, releaseDate, sprintsToComplete, row.key);
          updateStory.run(row.summary, row.sprint, row.status, row.assignee_id, row.story_points, row.key);
          if (featureId) updateFeature.run(featureId, row.key);
          insertHistory.run(story.id, row.sprint, row.status, row.assignee_id);
          imported++;
        }
      }
    });

    applyImport();

    // Clean up the preview
    previewStore.delete(import_id);

    res.json({ imported, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
