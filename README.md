# ManagerOS

A lightweight, self-hosted project management dashboard for engineering managers. Track projects, features, stories, team performance, blockers, and more — all from a single interface.

<!-- Screenshot placeholder: add a screenshot of the dashboard here -->

## Prerequisites

- **Node.js** >= 18
- npm (comes with Node.js)

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd manager-os

# Install all dependencies (server + client)
npm run install:all

# Start development servers (API + Vite dev server)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Production Build

```bash
# Build the client
npm run build

# Start the production server
NODE_ENV=production npm start
```

The app will be available at [http://localhost:3001](http://localhost:3001).

## Features

- **Project Dashboard** — Overview of all projects with health indicators, story progress, and blockers
- **Pipeline View** — Drag-and-drop kanban board for project status management
- **Feature Tracking** — Break projects into features, assign stories, track progress
- **Sprint Analytics** — Sprint-over-sprint comparison charts, completion rates, carry-over tracking
- **Team Management** — Team member profiles with active story counts and velocity charts
- **Performance Reviews** — Per-member performance metrics with story completion trends
- **1:1 Notes** — Track talking points, action items, and sentiment for each team member
- **To-Dos** — Personal task list with priorities, due dates, and project/member linking
- **Risks & Blockers** — Track blockers by severity with project and team member associations
- **Notes** — Markdown-supported notes with categories and contextual linking
- **Weekly Digest** — Auto-generated status reports for any date range (copy/download as markdown)
- **Jira/CSV Import** — Import stories from Jira CSV/JSON exports with diff preview and feature assignment
- **Data Export/Restore** — Full database export as JSON and restore from backup

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | React 18, React Router, Tailwind CSS |
| Charts     | Recharts                            |
| Drag & Drop| react-beautiful-dnd                 |
| Backend    | Express.js                          |
| Database   | SQLite (via better-sqlite3)         |
| Build      | Vite                                |

## Project Structure

```
manager-os/
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/      # Shared components (Layout, ErrorBoundary, ToastProvider, etc.)
│   │   ├── pages/           # Page components (Dashboard, Projects, Team, etc.)
│   │   ├── lib/             # API client utilities
│   │   ├── App.jsx          # Router configuration
│   │   └── main.jsx         # Entry point
│   └── vite.config.js
├── server/                  # Express backend
│   ├── db/
│   │   ├── init.js          # Database initialization
│   │   └── schema.sql       # Database schema
│   ├── routes/              # API route handlers
│   ├── services/            # Business logic (sprint diff, digest generation)
│   └── index.js             # Server entry point
├── data/                    # SQLite database (auto-created)
└── package.json             # Root workspace config
```

## Importing from Jira

1. In Jira, go to your board or backlog
2. Click **Export** and choose **CSV (all fields)** or export as JSON
3. In ManagerOS, navigate to the **Import** page
4. Drag and drop your file or click **Browse Files**
5. Review the diff preview — new, updated, carried-over, and closed stories are highlighted
6. Optionally assign stories to features using the dropdown in each row
7. Click **Confirm Import**

The importer recognizes these Jira columns (case-insensitive): `Issue key`, `Summary`, `Sprint`, `Status`, `Assignee`, `Story Points` / `Story point estimate`, `Resolved` / `Release Date`.

## Data Backup & Restore

### Export

Click **Export Data** in the sidebar footer. A JSON file containing all your data will download automatically.

### Restore

1. Navigate to the **Import** page
2. Click **Choose Backup File** in the "Restore from Backup" section
3. Select a previously exported JSON file
4. Confirm the restore — this replaces all existing data

## Development

### Adding a new API route

1. Create a new file in `server/routes/`
2. Define your Express router with endpoints
3. Register it in `server/index.js`

### Adding a new page

1. Create a new component in `client/src/pages/`
2. Add a route in `client/src/App.jsx`
3. Add a nav item in `client/src/components/Layout.jsx`

### Environment variables

| Variable        | Default | Description              |
|-----------------|---------|--------------------------|
| `PORT`          | `3001`  | Server port              |
| `NODE_ENV`      | —       | Set to `production` for prod |
| `VITE_API_URL`  | `/api`  | API base URL (client)    |

## License

MIT
