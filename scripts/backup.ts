/**
 * Consistent online backup of the SQLite database (safe while the app is running).
 *   npm run backup                      -> data/backups/narzaalai-<UTC timestamp>.db, verified
 *   NARZAALAI_BACKUP_DIR=/mnt/b KEEP=14 npm run backup
 * The uploaded documents live in NARZAALAI_UPLOAD_DIR and are NOT included: back that directory up as well (see README).
 */
import { backupDatabase } from "../src/lib/db/backup";

const db = process.env.NARZAALAI_DB_PATH ?? "data/narzaalai.db";
const dir = process.env.NARZAALAI_BACKUP_DIR ?? "data/backups";
const keep = Number(process.env.KEEP ?? "0") || undefined;

backupDatabase(db, dir, { keep })
  .then((r) => {
    console.log(`Backup OK: ${r.file} (${r.bytes} bytes, integrity_check=${r.integrity}, foreign-key violations=${r.foreignKeyViolations})`);
    if (r.pruned.length) console.log(`Pruned old backups: ${r.pruned.join(", ")}`);
    console.log(`Uploads are not included. Also copy: ${process.env.NARZAALAI_UPLOAD_DIR ?? "data/uploads"}`);
  })
  .catch((e: Error) => {
    console.error(`Backup FAILED: ${e.message}`);
    process.exit(1);
  });
