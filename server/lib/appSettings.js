const db = require('../db/init');

const DEFAULTS = {
  capacity_hours_per_point: '8',
  capacity_allocation_factor: '0.9',
};

function getSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  if (row && row.value !== null && row.value !== undefined) return row.value;
  return DEFAULTS[key] ?? null;
}

function setSetting(key, value) {
  const existing = db.prepare('SELECT key FROM app_settings WHERE key = ?').get(key);
  if (existing) {
    db.prepare(
      "UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE key = ?"
    ).run(String(value), key);
  } else {
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(key, String(value));
  }
}

function getNumber(key) {
  const v = getSetting(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : Number(DEFAULTS[key]);
}

module.exports = { getSetting, setSetting, getNumber, DEFAULTS };
