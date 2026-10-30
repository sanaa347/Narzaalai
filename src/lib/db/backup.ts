import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export interface BackupResult {
  file: string;
  bytes: number;
  integrity: string;
  foreignKeyViolations: number;
  pruned: string[];
}

const PATTERN = /^narzaalai-\d{8}T\d{6}Z\.db$/;
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/**
 * Takes a consistent online copy of a SQLite database using SQLite's backup API (safe while the app is running and in WAL
 * mode — a plain file copy of `*.db` alone can miss committed data that is still in the `-wal` file or capture a torn state).
 * The copy is then opened read-only and verified. Old backups matching our own file-name pattern beyond `keep` are removed.
 * Never overwrites an existing file, and refuses to write next to the source in a way that could replace it.
 */
export async function backupDatabase(sourceFile: string, destDir: string, opts: { keep?: number; now?: Date } = {}): Promise<BackupResult> {
  const src = path.resolve(sourceFile);
  if (!fs.existsSync(src)) throw new Error(`Source database not found: ${src}`);
  const dir = path.resolve(destDir);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `narzaalai-${stamp(opts.now ?? new Date())}.db`);
  if (dest === src) throw new Error("Refusing to back up onto the source database.");
  if (fs.existsSync(dest)) throw new Error(`Backup already exists: ${dest}`);

  const source = new Database(src, { readonly: true, fileMustExist: true });
  try {
    await source.backup(dest);
  } finally {
    source.close();
  }

  // The copy inherits WAL mode; switch it to a plain rollback journal so the backup is ONE self-contained file
  // (no -wal/-shm sidecars to lose or mismatch), then verify it. The live database is not touched.
  const copy = new Database(dest, { fileMustExist: true });
  let integrity: string;
  let fk: number;
  try {
    copy.pragma("journal_mode = DELETE");
    integrity = (copy.pragma("integrity_check", { simple: true }) as string) ?? "unknown";
    fk = (copy.pragma("foreign_key_check") as unknown[]).length;
  } finally {
    copy.close();
  }
  if (integrity !== "ok" || fk > 0) {
    throw new Error(`Backup written to ${dest} FAILED verification (integrity_check=${integrity}, foreign key violations=${fk}). Do not rely on it.`);
  }

  const pruned: string[] = [];
  if (opts.keep && opts.keep > 0) {
    const mine = fs.readdirSync(dir).filter((f) => PATTERN.test(f)).sort();
    for (const f of mine.slice(0, Math.max(0, mine.length - opts.keep))) {
      fs.rmSync(path.join(dir, f));
      pruned.push(f);
    }
  }
  return { file: dest, bytes: fs.statSync(dest).size, integrity, foreignKeyViolations: fk, pruned };
}
