# Security Policy

## Supported Versions

ManagerOS is currently maintained from the main branch. Security fixes should target the latest available code unless a release process is added later.

## Reporting A Vulnerability

Please report suspected vulnerabilities privately to the repository maintainers instead of opening a public issue.

Include:

- A clear description of the issue.
- Steps to reproduce or a proof of concept, if available.
- The affected area, such as Jira sync, backup/restore, uploads, API routes, or local data storage.
- Any known impact or workaround.

## Security Notes

- ManagerOS does not currently include built-in authentication or multi-tenant access control.
- Jira Personal Access Tokens are stored in the local application database and used only by the Express server.
- Local database files, uploaded files, `.env` files, and backups can contain sensitive data and should not be committed.
- Treat exported backups as sensitive because they may include Jira metadata, notes, team data, and tokens or configuration.
