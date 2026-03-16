# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (server + client)
npm run install:all

# Start both dev servers concurrently (API on :3001, Vite on :5173)
npm run dev

# Build client for production
npm run build

# Start production server (serves built client + API on :3001)
NODE_ENV=production npm start

# Seed the database with sample data
cd server && npm run seed

# Server dev only (uses --watch for auto-reload)
cd server && npm run dev

# Client dev only
cd client && npm run dev
```

No test framework is configured. No linter is configured.

## Architecture

Monorepo with two independent npm packages (`client/` and `server/`) coordinated by a root `package.json` using `concurrently`.

### Server (`server/`)

- **Runtime**: Node.js with Express (CommonJS modules)
- **Database**: SQLite via `sql.js` (pure JS, no native bindings). DB file lives at `data/manager-os.db`
- **DB layer** (`server/db/init.js`): Wraps sql.js with a better-sqlite3-compatible API (`db.prepare(sql).run/get/all(...params)`). Auto-persists to disk after each write unless inside a transaction. Schema is in `server/db/schema.sql` and applied on every startup with `CREATE TABLE IF NOT EXISTS`. Migrations for adding columns are done inline in `init.js` using `PRAGMA table_info`.
- **Routes** (`server/routes/`): One file per domain entity (projects, features, team, stories/import, sprints, blockers, oneOnOnes, notes, todos, digest, backup, timeline). All mounted under `/api` in `server/index.js`.
- **Services** (`server/services/`): Business logic for sprint diff calculations and weekly digest generation.
- Some routers mount at `/api` directly (features, oneOnOnes, backup) rather than a sub-path — check `server/index.js` for the exact mount points.

### Client (`client/`)

- **Stack**: React 18, React Router v7, Tailwind CSS v4 (via `@tailwindcss/vite` plugin), Recharts, `@hello-pangea/dnd` (fork of react-beautiful-dnd), lucide-react icons
- **API client** (`client/src/lib/api.js`): Thin wrapper around fetch with `api.get/post/put/del` methods. Base URL configurable via `VITE_API_URL` env var, defaults to `/api`.
- **Pages** (`client/src/pages/`): One component per route, mapped in `App.jsx`
- **Shared components** (`client/src/components/`): Layout (sidebar nav + outlet), ErrorBoundary, ToastProvider, LoadingBar, NotesPanel
- **Routing**: All routes are children of `<Layout />` which provides the sidebar shell

### Data Model

Core entities: projects → features → stories (with sprint history tracking). Supporting entities: team_members, blockers, notes, todos, one_on_ones. Foreign keys are enforced (`PRAGMA foreign_keys = ON`). Projects cascade-delete features; team_members cascade-delete one_on_ones.

### Dev Server Proxy

Vite proxies `/api` requests to `http://localhost:3001` during development, so both servers must be running (handled by `npm run dev` at root).
