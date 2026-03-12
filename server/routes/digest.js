const express = require('express');
const router = express.Router();
const { generateWeeklyDigest, formatDigestAsMarkdown } = require('../services/digest');

// GET /api/digest?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', (req, res) => {
  try {
    const to = req.query.to || new Date().toISOString().split('T')[0];
    const from = req.query.from || (() => {
      const d = new Date(to);
      d.setDate(d.getDate() - 6);
      return d.toISOString().split('T')[0];
    })();

    const structured = generateWeeklyDigest(from, to);
    const markdown = formatDigestAsMarkdown(structured);

    res.json({ structured, markdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
