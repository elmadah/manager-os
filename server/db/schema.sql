CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'upcoming' CHECK(status IN ('upcoming','planning','active','wrapping_up','complete')),
  health TEXT DEFAULT 'green' CHECK(health IN ('green','yellow','red')),
  color TEXT DEFAULT '#3B82F6',
  start_date TEXT,
  target_date TEXT,
  is_starred INTEGER DEFAULT 0,
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
  sort_order INTEGER DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_member_assignments (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, member_id)
);

CREATE TABLE IF NOT EXISTS jira_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  base_url TEXT NOT NULL,
  pat_token TEXT NOT NULL,
  story_points_field TEXT DEFAULT 'customfield_10026',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jira_boards (
  id TEXT PRIMARY KEY,
  board_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jira_project_mappings (
  id TEXT PRIMARY KEY,
  jira_project_key TEXT NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  UNIQUE(jira_project_key)
);

CREATE TABLE IF NOT EXISTS standup_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('In Progress', 'Blocked', 'In Review', 'Done')),
  note TEXT,
  standup_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(team_member_id, story_id, standup_date)
);

CREATE INDEX IF NOT EXISTS idx_standup_entries_date ON standup_entries(standup_date);
CREATE INDEX IF NOT EXISTS idx_standup_entries_member ON standup_entries(team_member_id);
CREATE INDEX IF NOT EXISTS idx_standup_entries_story ON standup_entries(story_id);

CREATE TABLE IF NOT EXISTS story_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  imported_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS capacity_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  jira_sprint_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS capacity_plan_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES capacity_plans(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  is_excluded INTEGER DEFAULT 0,
  exclude_from_points INTEGER DEFAULT 0,
  UNIQUE(plan_id, member_id)
);

CREATE TABLE IF NOT EXISTS capacity_leave (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES capacity_plans(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  leave_date TEXT NOT NULL,
  leave_type TEXT NOT NULL CHECK(leave_type IN ('vacation','holiday','sick','loaned','other')),
  is_planned INTEGER DEFAULT 1,
  loan_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  loan_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  loan_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(plan_id, member_id, leave_date)
);

CREATE INDEX IF NOT EXISTS idx_capacity_leave_plan ON capacity_leave(plan_id);
CREATE INDEX IF NOT EXISTS idx_capacity_plan_members_plan ON capacity_plan_members(plan_id);

CREATE TABLE IF NOT EXISTS github_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  base_url TEXT NOT NULL,
  pat_token TEXT NOT NULL,
  sync_days_back INTEGER DEFAULT 180,
  last_sync_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS github_repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  label TEXT DEFAULT '',
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  is_active INTEGER DEFAULT 1,
  last_sync_at TEXT,
  last_sync_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(owner, name)
);

CREATE TABLE IF NOT EXISTS pull_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES github_repos(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('open','merged','closed')),
  is_draft INTEGER DEFAULT 0,
  author_login TEXT,
  author_member_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  base_branch TEXT,
  head_branch TEXT,
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  changed_files INTEGER DEFAULT 0,
  pr_created_at TEXT,
  first_review_at TEXT,
  merged_at TEXT,
  closed_at TEXT,
  jira_key TEXT,
  story_id INTEGER REFERENCES stories(id) ON DELETE SET NULL,
  sprint TEXT,
  sprint_source TEXT CHECK(sprint_source IN ('story','date_window','none')),
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(repo_id, number)
);

CREATE TABLE IF NOT EXISTS pr_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pull_request_id INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  reviewer_login TEXT,
  reviewer_member_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  state TEXT CHECK(state IN ('approved','changes_requested','commented','dismissed')),
  submitted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pull_requests_sprint ON pull_requests(sprint);
CREATE INDEX IF NOT EXISTS idx_pull_requests_repo ON pull_requests(repo_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_author ON pull_requests(author_member_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_story ON pull_requests(story_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_merged_at ON pull_requests(merged_at);
CREATE INDEX IF NOT EXISTS idx_pr_reviews_pr ON pr_reviews(pull_request_id);
CREATE INDEX IF NOT EXISTS idx_pr_reviews_member ON pr_reviews(reviewer_member_id);
