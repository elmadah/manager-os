const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'manager-os.db');

let sqlDb = null;
let inTransaction = false;

function save() {
  if (!sqlDb) return;
  const data = sqlDb.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  // export() resets session pragmas in sql.js, so re-enable foreign keys
  sqlDb.exec('PRAGMA foreign_keys = ON');
}

function saveIfNeeded() {
  if (!inTransaction) save();
}

/**
 * Wrapper around sql.js that provides a better-sqlite3-compatible API.
 * All route files can use db.prepare(sql).run/get/all(...params) as before.
 */
const db = {
  /**
   * Initialize the database asynchronously. Must be called before any queries.
   */
  init: async function () {
    const SQL = await initSqlJs();

    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      sqlDb = new SQL.Database(buffer);
    } else {
      sqlDb = new SQL.Database();
    }

    // Enable foreign keys
    sqlDb.exec('PRAGMA foreign_keys = ON');

    // Run schema
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    sqlDb.exec(schema);

    // Migrations for existing databases
    function migrate(table, column, type) {
      const result = sqlDb.exec(`PRAGMA table_info(${table})`);
      const cols = result.length
        ? result[0].values.map((v) => {
            const obj = {};
            result[0].columns.forEach((col, i) => {
              obj[col] = v[i];
            });
            return obj;
          })
        : [];
      if (!cols.find((c) => c.name === column)) {
        sqlDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    }

    migrate('projects', 'color', "TEXT DEFAULT '#3B82F6'");
    migrate('features', 'start_date', 'TEXT');
    migrate('features', 'target_date', 'TEXT');
    migrate('todos', 'sort_order', 'INTEGER DEFAULT 0');

    // Jira integration migrations
    migrate('stories', 'jira_board_id', 'TEXT REFERENCES jira_boards(id)');
    migrate('stories', 'epic_key', 'TEXT');
    migrate('stories', 'epic_name', 'TEXT');
    migrate('stories', 'issue_type', 'TEXT');
    migrate('stories', 'last_synced_at', 'TEXT');

    // Team member color
    migrate('team_members', 'color', 'TEXT');

    // Backfill colors for existing members without one
    const MEMBER_COLORS = [
      '#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899',
      '#06b6d4','#ef4444','#6366f1','#14b8a6','#f97316',
      '#0ea5e9','#84cc16','#a855f7','#f43f5e','#22d3ee',
      '#eab308','#d946ef','#fb923c','#2dd4bf','#818cf8',
      '#34d399','#c084fc','#fbbf24','#f472b6','#38bdf8',
      '#a3e635','#e879f9','#fb7185','#67e8f9','#facc15',
    ];
    const noColorMembers = sqlDb.exec('SELECT id FROM team_members WHERE color IS NULL');
    if (noColorMembers.length && noColorMembers[0].values.length) {
      for (let i = 0; i < noColorMembers[0].values.length; i++) {
        const memberId = noColorMembers[0].values[i][0];
        const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
        sqlDb.exec(`UPDATE team_members SET color = '${color}' WHERE id = ${memberId}`);
      }
    }

    // Teams migrations
    migrate('team_members', 'team_id', 'INTEGER REFERENCES teams(id)');
    migrate('jira_boards', 'team_id', 'INTEGER REFERENCES teams(id)');
    migrate('projects', 'team_id', 'INTEGER REFERENCES teams(id)');

    // Capacity plan member flags
    migrate('capacity_plan_members', 'exclude_from_points', 'INTEGER DEFAULT 0');

    // Soft delete for team members
    migrate('team_members', 'is_active', 'INTEGER DEFAULT 1');

    // Level field for team members (e.g. C11, C12, Contractor)
    migrate('team_members', 'level', 'TEXT');

    // Migrate team_members.team_id data into junction table
    const existing = sqlDb.exec(
      `SELECT id, team_id FROM team_members WHERE team_id IS NOT NULL`
    );
    if (existing.length && existing[0].values.length) {
      for (const [memberId, teamId] of existing[0].values) {
        sqlDb.exec(
          `INSERT OR IGNORE INTO team_member_assignments (team_id, member_id) VALUES (${teamId}, ${memberId})`
        );
      }
    }

    save();
    return db;
  },

  prepare: function (sql) {
    return {
      run: function (...params) {
        sqlDb.run(sql, params);
        const meta = sqlDb.exec(
          'SELECT last_insert_rowid() as id, changes() as c'
        );
        const lastInsertRowid = meta[0]?.values[0][0] ?? 0;
        const changes = meta[0]?.values[0][1] ?? 0;
        saveIfNeeded();
        return { lastInsertRowid, changes };
      },
      get: function (...params) {
        const stmt = sqlDb.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        let result = undefined;
        if (stmt.step()) {
          result = stmt.getAsObject();
        }
        stmt.free();
        return result;
      },
      all: function (...params) {
        const stmt = sqlDb.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },
    };
  },

  exec: function (sql) {
    sqlDb.exec(sql);
    saveIfNeeded();
  },

  pragma: function (str) {
    const parts = str.split('=').map((s) => s.trim());
    if (parts.length === 2) {
      sqlDb.exec(`PRAGMA ${parts[0]} = ${parts[1]}`);
      saveIfNeeded();
      return;
    }
    const result = sqlDb.exec(`PRAGMA ${str}`);
    if (!result.length) return [];
    return result[0].values.map((v) => {
      const obj = {};
      result[0].columns.forEach((col, i) => {
        obj[col] = v[i];
      });
      return obj;
    });
  },

  transaction: function (fn) {
    return function (...args) {
      inTransaction = true;
      sqlDb.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        sqlDb.run('COMMIT');
        inTransaction = false;
        save();
        return result;
      } catch (err) {
        sqlDb.run('ROLLBACK');
        inTransaction = false;
        throw err;
      }
    };
  },

  close: function () {
    if (sqlDb) {
      save();
      sqlDb.close();
      sqlDb = null;
    }
  },
};

module.exports = db;
