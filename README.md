# ManagerOS

ManagerOS is a lightweight, self-hosted workspace for project, product, and delivery leaders. It brings projects, Jira-driven sprint tracking, team context, capacity planning, blockers, notes, 1:1s, and weekly reporting into one local dashboard.

The app is currently optimized for internal/team use: it runs as a Node.js + React monorepo, stores data in a local SQLite-compatible database file, and can sync with Jira Data Center through a server-side Personal Access Token.

## Status

- Built for local/self-hosted use by engineering, product, program, and delivery teams.
- No authentication or multi-tenant access control is included yet.

## Prerequisites

- Node.js 18 or newer
- npm
- Optional: Jira Data Center Personal Access Token for live board sync

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd manager-os

# Install server and client dependencies
npm run install:all

# Start the API on :3001 and Vite on :5173
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Production Build

```bash
# Build the React client
npm run build

# Start the Express server, which serves the built client and API
NODE_ENV=production npm start
```

Open [http://localhost:3001](http://localhost:3001).

## Common Commands

```bash
# Install all dependencies
npm run install:all

# Start both dev servers
npm run dev

# Build the client
npm run build

# Start production server
NODE_ENV=production npm start

# Seed sample data
cd server && npm run seed

# Server only
cd server && npm run dev

# Client only
cd client && npm run dev
```

## Features

- **Dashboard** - project health, active blockers, overdue todos, team summary, and sprint pulse.
- **Projects** - kanban-style project pipeline, project details, features, story progress, project todos, and linked notes.
- **Timeline** - project and feature timeline views with calendar context.
- **Feature and Story Tracking** - story assignment, feature reassignment, issue type indicators, Jira links, carry-over tracking, and editable story metadata.
- **Sprint Analytics** - sprint-over-sprint metrics, completion rates, carry-over/new/completed story sections, team filters, and linked capacity plan badges.
- **Standups** - per-person standup logging, stale story detection, status history, and sprint pulse indicators.
- **Team Management** - member profiles, roles, levels, colors, active/inactive status, team assignments, active work, velocity, performance context, blockers, and notes.
- **1:1 Notes** - dated 1:1 records with talking points, action items, sentiment, and history.
- **Capacity Planning** - team-scoped capacity plans, weekday grids, leave ranges, loaned time, planned vs. unplanned leave, excluded members, points, hours, utilization, and global capacity settings.
- **Todos** - drag-and-drop personal task list with priority, due dates, completion state, project links, and member links.
- **Risks & Blockers** - severity/status tracking with project, feature, and team member associations.
- **Rich Notes** - Tiptap-based notes with slash commands, headings, lists, task lists, tables, links, highlights, image uploads, mentions, and contextual links to projects/features/team members.
- **Weekly Digest** - generated Markdown status reports for selected date ranges, with copy and download actions.
- **Jira Data Center Sync** - server-side PAT storage, connection testing, board registration, active sprint sync preview, story status import, story points field configuration, project/feature assignment for new issues, and Jira project mapping.
- **CSV/JSON Import** - import stories from Jira exports with diff preview and feature assignment.
- **Backup & Restore** - full JSON export and restore of app data.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, React Router 7, Tailwind CSS 4 |
| Editor | Tiptap |
| Charts | Recharts |
| Drag and drop | `@hello-pangea/dnd` |
| Icons | `lucide-react` |
| Backend | Node.js, Express |
| Database | SQLite-compatible local file through `sql.js` |
| Build | Vite |

## Project Structure

```text
manager-os/
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/      # Shared UI, timeline, capacity, notes, sprint components
│   │   ├── pages/           # Route-level pages
│   │   ├── hooks/           # Shared React hooks
│   │   ├── lib/             # API client and helpers
│   │   ├── App.jsx          # Router configuration
│   │   └── main.jsx         # Client entry point
│   └── vite.config.js       # Vite + Tailwind plugin config
├── server/                  # Express backend
│   ├── db/
│   │   ├── init.js          # sql.js initialization, persistence, migrations
│   │   ├── schema.sql       # Database schema
│   │   └── seed.js          # Sample data
│   ├── lib/                 # Shared server helpers
│   ├── routes/              # API route handlers
│   ├── services/            # Sprint diff and digest logic
│   └── index.js             # Server entry point
├── data/                    # Runtime database and uploads, created locally
├── docs/                    # Design docs and implementation plans
└── package.json             # Root scripts
```

## Data Storage

ManagerOS persists app data to `data/manager-os.db` using `sql.js`. The database layer exposes a small `better-sqlite3`-style API to the route files and writes changes back to disk after mutations.

Runtime uploads are served from `data/uploads`. Treat the whole `data/` directory as local runtime state; do not commit it.

## Jira Setup

ManagerOS supports Jira Data Center sync from the Settings page.

1. Create a Jira Data Center Personal Access Token.
2. Open **Settings** in ManagerOS.
3. Enter the Jira base URL, PAT, and story points custom field.
4. Test the connection.
5. Add one or more Jira board IDs.
6. Click **Sync** on a board to preview the active sprint.
7. Assign new issues to ManagerOS projects/features and confirm the sync.

Jira calls are made by the Express server. The PAT is stored in the local database and is not sent to the browser.

## Importing From Jira Exports

1. In Jira, export issues as CSV or JSON.
2. In ManagerOS, open **Settings > Import / Export**.
3. Upload the file in **Import Stories**.
4. Review the diff preview.
5. Assign new stories to projects/features as needed.
6. Confirm the import.

The importer recognizes common Jira fields such as issue key, summary, sprint, status, assignee, story points, resolved/release date, issue type, epic key, and epic name.

## Backup And Restore

Use **Settings > Import / Export** to export a full JSON backup or restore from a previous backup.

Restoring replaces the current app data. Export a backup before testing restore flows against real data.

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Express server port |
| `NODE_ENV` | unset | Set to `production` to serve `client/dist` from Express |
| `VITE_API_URL` | `/api` | API base URL used by the client |

## Development Notes

### Adding An API Route

1. Create a route file in `server/routes/`.
2. Add the Express router and endpoints.
3. Register the router in `server/index.js`.

Some routers mount under a subpath, such as `/api/projects`; others mount directly under `/api`. Check `server/index.js` before adding new endpoints.

### Adding A Page

1. Create a component in `client/src/pages/`.
2. Register it in `client/src/App.jsx`.
3. Add sidebar navigation in `client/src/components/Layout.jsx` when it is a primary route.

### Database Changes

- Add new tables to `server/db/schema.sql` with `CREATE TABLE IF NOT EXISTS`.
- Add column migrations in `server/db/init.js` for existing local databases.
- Foreign keys are enabled on startup.

## License

MIT
