const express = require('express');
const router = express.Router();
const { getSetting, setSetting, DEFAULTS } = require('../lib/appSettings');

const CAPACITY_KEYS = ['capacity_hours_per_point', 'capacity_allocation_factor'];

// GET /api/settings/app/capacity
router.get('/capacity', (req, res) => {
  try {
    const result = {};
    for (const key of CAPACITY_KEYS) {
      result[key] = Number(getSetting(key));
    }
    result.defaults = { ...DEFAULTS };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/app/capacity
router.put('/capacity', (req, res) => {
  try {
    const { capacity_hours_per_point, capacity_allocation_factor } = req.body;

    if (capacity_hours_per_point !== undefined) {
      const n = Number(capacity_hours_per_point);
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ error: 'capacity_hours_per_point must be a positive number' });
      }
      setSetting('capacity_hours_per_point', n);
    }
    if (capacity_allocation_factor !== undefined) {
      const n = Number(capacity_allocation_factor);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        return res.status(400).json({ error: 'capacity_allocation_factor must be between 0 and 1' });
      }
      setSetting('capacity_allocation_factor', n);
    }

    const result = {};
    for (const key of CAPACITY_KEYS) {
      result[key] = Number(getSetting(key));
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
