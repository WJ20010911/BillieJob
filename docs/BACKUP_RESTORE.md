# Backup and Restore

Each backup archive contains:

- `database.sqlite`: a consistent SQLite snapshot of all application data.
- `uploads/`: user-uploaded attachments, when any exist.
- `backup-manifest.json`: creation metadata and restore steps.

The server runs `npm run backup` hourly. Archives are stored in `backups/` and are ignored by Git. The default retention is 72 hours. Set `BACKUP_RETENTION_HOURS` to change it, or `BACKUP_DIR` to move backup storage to another mounted disk.

To move to a new server:

1. Deploy BillieJob and install its Node dependencies.
2. Stop the BillieJob process on the new server.
3. Copy a downloaded `billiejob-backup-*.tar.gz` archive to the project root and extract it.
4. Replace `dev.db` with the extracted `database.sqlite` (or replace the SQLite file named by `DATABASE_URL`).
5. Copy the extracted `uploads/` contents to `public/uploads/`.
6. Configure server-only values in `.env.local`, run `npx prisma generate`, build, and restart the process.

Do not commit backup archives, database files, `.env.local`, or uploaded files to GitHub.
