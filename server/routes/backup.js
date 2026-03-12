const express = require('express');
const router = express.Router();
const db = require('../db/init');
const fs = require('fs');
const path = require('path');

// GET /api/export — Export the entire database as JSON
router.get('/export', (req, res) => {
  try {
    const data = {
      exported_at: new Date().toISOString(),
      projects: db.prepare('SELECT * FROM projects').all(),
      features: db.prepare('SELECT * FROM features').all(),
      stories: db.prepare('SELECT * FROM stories').all(),
      team_members: db.prepare('SELECT * FROM team_members').all(),
      notes: db.prepare('SELECT * FROM notes').all(),
      todos: db.prepare('SELECT * FROM todos').all(),
      blockers: db.prepare('SELECT * FROM blockers').all(),
      one_on_ones: db.prepare('SELECT * FROM one_on_ones').all(),
      story_sprint_history: db.prepare('SELECT * FROM story_sprint_history').all(),
    };

    const filename = `manager-os-export-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/restore — Restore database from exported JSON
router.post('/import/restore', (req, res) => {
  try {
    const data = req.body;

    if (!data || !data.projects || !data.team_members) {
      return res.status(400).json({ error: 'Invalid backup file. Must contain projects and team_members.' });
    }

    const tables = [
      'story_sprint_history', 'stories', 'one_on_ones', 'notes',
      'todos', 'blockers', 'features', 'team_members', 'projects',
    ];

    const restore = db.transaction(() => {
      // Temporarily disable foreign keys for clean deletion order
      db.pragma('foreign_keys = OFF');

      // Clear all tables
      for (const table of tables) {
        db.prepare(`DELETE FROM ${table}`).run();
      }

      // Re-enable foreign keys
      db.pragma('foreign_keys = ON');

      // Insert projects
      if (data.projects?.length) {
        const stmt = db.prepare(`INSERT INTO projects (id, name, description, status, health, start_date, target_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const r of data.projects) {
          stmt.run(r.id, r.name, r.description || '', r.status || 'upcoming', r.health || 'green', r.start_date, r.target_date, r.created_at, r.updated_at);
        }
      }

      // Insert team_members
      if (data.team_members?.length) {
        const stmt = db.prepare(`INSERT INTO team_members (id, name, role, email, created_at) VALUES (?, ?, ?, ?, ?)`);
        for (const r of data.team_members) {
          stmt.run(r.id, r.name, r.role || '', r.email || '', r.created_at);
        }
      }

      // Insert features
      if (data.features?.length) {
        const stmt = db.prepare(`INSERT INTO features (id, project_id, name, description, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const r of data.features) {
          stmt.run(r.id, r.project_id, r.name, r.description || '', r.status || 'not_started', r.priority || 'medium', r.created_at, r.updated_at);
        }
      }

      // Insert stories
      if (data.stories?.length) {
        const stmt = db.prepare(`INSERT INTO stories (id, key, summary, sprint, status, assignee_id, feature_id, story_points, release_date, first_seen_sprint, carry_over_count, sprints_to_complete, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const r of data.stories) {
          stmt.run(r.id, r.key, r.summary, r.sprint, r.status, r.assignee_id, r.feature_id, r.story_points || 0, r.release_date, r.first_seen_sprint, r.carry_over_count || 0, r.sprints_to_complete, r.created_at, r.updated_at);
        }
      }

      // Insert notes
      if (data.notes?.length) {
        const stmt = db.prepare(`INSERT INTO notes (id, content, category, project_id, feature_id, team_member_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const r of data.notes) {
          stmt.run(r.id, r.content || '', r.category || 'general', r.project_id, r.feature_id, r.team_member_id, r.created_at, r.updated_at);
        }
      }

      // Insert todos
      if (data.todos?.length) {
        const stmt = db.prepare(`INSERT INTO todos (id, title, description, due_date, priority, is_complete, project_id, team_member_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const r of data.todos) {
          stmt.run(r.id, r.title, r.description || '', r.due_date, r.priority || 'medium', r.is_complete || 0, r.project_id, r.team_member_id, r.created_at, r.updated_at);
        }
      }

      // Insert blockers
      if (data.blockers?.length) {
        const stmt = db.prepare(`INSERT INTO blockers (id, title, description, severity, status, project_id, feature_id, team_member_id, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const r of data.blockers) {
          stmt.run(r.id, r.title, r.description || '', r.severity || 'medium', r.status || 'active', r.project_id, r.feature_id, r.team_member_id, r.created_at, r.resolved_at);
        }
      }

      // Insert one_on_ones
      if (data.one_on_ones?.length) {
        const stmt = db.prepare(`INSERT INTO one_on_ones (id, team_member_id, date, talking_points, action_items, sentiment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const r of data.one_on_ones) {
          stmt.run(r.id, r.team_member_id, r.date, r.talking_points || '', r.action_items || '', r.sentiment || 'neutral', r.created_at, r.updated_at);
        }
      }

      // Insert story_sprint_history
      if (data.story_sprint_history?.length) {
        const stmt = db.prepare(`INSERT INTO story_sprint_history (id, story_id, sprint, status, assignee_id, imported_at) VALUES (?, ?, ?, ?, ?, ?)`);
        for (const r of data.story_sprint_history) {
          stmt.run(r.id, r.story_id, r.sprint, r.status, r.assignee_id, r.imported_at);
        }
      }
    });

    restore();

    const counts = {
      projects: data.projects?.length || 0,
      features: data.features?.length || 0,
      stories: data.stories?.length || 0,
      team_members: data.team_members?.length || 0,
      notes: data.notes?.length || 0,
      todos: data.todos?.length || 0,
      blockers: data.blockers?.length || 0,
      one_on_ones: data.one_on_ones?.length || 0,
      story_sprint_history: data.story_sprint_history?.length || 0,
    };

    res.json({ success: true, restored: counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
