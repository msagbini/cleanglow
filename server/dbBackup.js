// Daily SQLite backups, written into the same persistent data directory as
// the live database — protects against a bad migration, a corrupted write,
// or an admin mistake wiping data, all recoverable without touching Railway
// infra. This does NOT protect against losing the volume itself (if that
// volume is ever deleted, these backups go with it) — for that, the backup
// files still need to be copied off-box periodically (e.g. downloaded from
// Railway) by whoever operates the site.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupsDir = path.join(__dirname, 'data', 'backups');

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day
const KEEP_BACKUPS = 14; // roughly two weeks of daily snapshots

export function runBackupOnce() {
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `bookings-${stamp}.sqlite`);

  // VACUUM INTO takes a consistent, compacted snapshot in a single atomic
  // step — safe to run against a live database with requests still coming
  // in, unlike a raw file copy which could capture a half-written page.
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);

  const files = fs.readdirSync(backupsDir)
    .filter(f => f.startsWith('bookings-') && f.endsWith('.sqlite'))
    .sort();
  const toDelete = files.slice(0, Math.max(0, files.length - KEEP_BACKUPS));
  for (const f of toDelete) fs.unlinkSync(path.join(backupsDir, f));
}

export function startBackupSweep() {
  // One immediately on boot so a fresh deploy isn't unprotected for a full
  // day before the first scheduled run — wrapped the same as the scheduled
  // one below, since a bad first run must never crash server startup.
  safeRunBackup();
  setInterval(safeRunBackup, SWEEP_INTERVAL_MS);
}

function safeRunBackup() {
  try {
    runBackupOnce();
  } catch (err) {
    console.error('[db-backup] Failed to create backup, will retry next interval:', err.message);
  }
}
