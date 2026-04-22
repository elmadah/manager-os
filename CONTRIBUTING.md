# Contributing

Thanks for taking time to improve ManagerOS. This project is intended to stay practical, self-hosted, and easy for teams to run locally.

## Development Setup

```bash
npm run install:all
npm run dev
```

The API runs on [http://localhost:3001](http://localhost:3001), and the client runs on [http://localhost:5173](http://localhost:5173).

## Before Opening A Pull Request

- Keep changes focused on one bug, feature, or cleanup.
- Update `README.md` when behavior, setup, or user-facing workflows change.
- Do not commit local runtime data from `data/`, database files, uploaded files, or `.env` files.
- Run the relevant build or manual verification for the area you changed.

## Project Conventions

- Server code uses CommonJS modules under `server/`.
- Client code uses React components under `client/src/`.
- API calls should go through `client/src/lib/api.js` unless a direct `fetch` is needed for file upload or a method the wrapper does not expose.
- Database schema additions belong in `server/db/schema.sql`.
- Migrations for existing local databases belong in `server/db/init.js`.

## Pull Request Checklist

- Describe what changed and why.
- Include screenshots for visible UI changes when possible.
- Note any data migration or backup considerations.
- List the commands or manual steps used to verify the change.
