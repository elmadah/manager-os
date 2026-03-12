const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/todos?overdue=true
router.get('/', (req, res) => {
  try {
    if (req.query.overdue === 'true') {
      const todos = db.prepare(`
        SELECT * FROM todos
        WHERE due_date < date('now')
          AND is_complete = 0
        ORDER BY due_date ASC
      `).all();
      return res.json(todos);
    }

    const todos = db.prepare('SELECT * FROM todos ORDER BY due_date ASC').all();
    res.json(todos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
