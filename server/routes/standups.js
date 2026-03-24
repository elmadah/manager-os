const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/standups/member/:id?date=YYYY-MM-DD
// Get all standup entries for a team member on a given date
router.get('/member/:id', (req, res) => {
  try {
    const memberId = req.params.id;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const entries = db.prepare(`
      SELECT se.*, s.key as story_key, s.summary as story_summary, s.status as story_status
      FROM standup_entries se
      JOIN stories s ON s.id = se.story_id
      WHERE se.team_member_id = ?
        AND se.standup_date = ?
      ORDER BY s.key
    `).all(memberId, date);

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/standups/story/:id
// Get all standup entries for a specific story, reverse chronological
router.get('/story/:id', (req, res) => {
  try {
    const storyId = req.params.id;

    const entries = db.prepare(`
      SELECT se.*, tm.name as member_name
      FROM standup_entries se
      JOIN team_members tm ON tm.id = se.team_member_id
      WHERE se.story_id = ?
      ORDER BY se.standup_date DESC, se.created_at DESC
    `).all(storyId);

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/standups/stale?threshold=2
// Get all currently stale story+member pairs
router.get('/stale', (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 2;

    // Get all distinct (member, story) pairs that have at least `threshold` entries
    const pairs = db.prepare(`
      SELECT DISTINCT team_member_id, story_id
      FROM standup_entries
      GROUP BY team_member_id, story_id
      HAVING COUNT(*) >= ?
    `).all(threshold);

    const staleMap = {};

    for (const pair of pairs) {
      // Get the most recent `threshold` entries for this pair
      const recent = db.prepare(`
        SELECT status, note
        FROM standup_entries
        WHERE team_member_id = ? AND story_id = ?
        ORDER BY standup_date DESC
        LIMIT ?
      `).all(pair.team_member_id, pair.story_id, threshold);

      if (recent.length < threshold) continue;

      // Check: all same status and none have notes
      const firstStatus = recent[0].status;
      const allSameStatus = recent.every(e => e.status === firstStatus);
      const noneHaveNotes = recent.every(e => !e.note || e.note.trim() === '');

      if (allSameStatus && noneHaveNotes) {
        // Count total consecutive stale days from most recent
        const allEntries = db.prepare(`
          SELECT status, note
          FROM standup_entries
          WHERE team_member_id = ? AND story_id = ?
          ORDER BY standup_date DESC
        `).all(pair.team_member_id, pair.story_id);

        let daysSstale = 0;
        for (const entry of allEntries) {
          if (entry.status === firstStatus && (!entry.note || entry.note.trim() === '')) {
            daysSstale++;
          } else {
            break;
          }
        }

        const key = `${pair.story_id}-${pair.team_member_id}`;
        staleMap[key] = daysSstale;
      }
    }

    res.json(staleMap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/standups/stories-with-history
// Returns array of story IDs that have at least one standup entry
router.get('/stories-with-history', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT story_id FROM standup_entries
    `).all();
    res.json(rows.map(r => r.story_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/standups/batch
// Create or update multiple entries at once
router.post('/batch', (req, res) => {
  try {
    const { team_member_id, standup_date, entries } = req.body;

    if (!team_member_id || !standup_date || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'team_member_id, standup_date, and entries array are required' });
    }

    const upsert = db.transaction((entries) => {
      const results = [];
      for (const entry of entries) {
        if (!entry.story_id || !entry.status) continue;

        db.prepare(`
          INSERT INTO standup_entries (team_member_id, story_id, status, note, standup_date)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(team_member_id, story_id, standup_date)
          DO UPDATE SET status = excluded.status, note = excluded.note
        `).run(team_member_id, entry.story_id, entry.status, entry.note || null, standup_date);

        results.push({ story_id: entry.story_id, status: entry.status });
      }
      return results;
    });

    const results = upsert(entries);
    res.status(201).json({ saved: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/standups/:id
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM standup_entries WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Standup entry not found' });
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
