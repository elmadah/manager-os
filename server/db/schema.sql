CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'upcoming' CHECK(status IN ('upcoming','planning','active','wrapping_up','complete')),
  health TEXT DEFAULT 'green' CHECK(health IN ('green','yellow','red')),
  color TEXT DEFAULT '#3B82F6',
  start_date TEXT,
  target_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','complete')),
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
  start_date TEXT,
  target_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  email TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  summary TEXT NOT NULL,
  sprint TEXT,
  status TEXT,
  assignee_id INTEGER REFERENCES team_members(id),
  feature_id INTEGER REFERENCES features(id),
  story_points INTEGER DEFAULT 0,
  release_date TEXT,
  first_seen_sprint TEXT,
  carry_over_count INTEGER DEFAULT 0,
  sprints_to_complete INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS story_sprint_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  sprint TEXT,
  status TEXT,
  assignee_id INTEGER,
  imported_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT DEFAULT '',
  category TEXT DEFAULT 'general' CHECK(category IN ('one_on_one','performance','update','blocker','retro','general')),
  project_id INTEGER REFERENCES projects(id),
  feature_id INTEGER REFERENCES features(id),
  team_member_id INTEGER REFERENCES team_members(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date TEXT,
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
  is_complete INTEGER DEFAULT 0,
  project_id INTEGER REFERENCES projects(id),
  team_member_id INTEGER REFERENCES team_members(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blockers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  severity TEXT DEFAULT 'medium' CHECK(severity IN ('critical','high','medium','low')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active','monitoring','resolved')),
  project_id INTEGER REFERENCES projects(id),
  feature_id INTEGER REFERENCES features(id),
  team_member_id INTEGER REFERENCES team_members(id),
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS one_on_ones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  talking_points TEXT DEFAULT '',
  action_items TEXT DEFAULT '',
  sentiment TEXT DEFAULT 'neutral' CHECK(sentiment IN ('engaged','neutral','frustrated','needs_support')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
