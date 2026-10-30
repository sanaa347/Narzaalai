import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Db = Database.Database;

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

export function migrate(db: Db): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
  );
  const applied = new Set(
    (db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[]).map((r) => r.name),
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(file);
    })();
    ran.push(file);
  }
  return ran;
}

export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

const globalForDb = globalThis as unknown as { __narzaalaiDb?: Db };

/** Process-wide database handle. Tests may replace it with `useDb`. */
export function getDb(): Db {
  if (!globalForDb.__narzaalaiDb) {
    globalForDb.__narzaalaiDb = openDb(process.env.NARZAALAI_DB_PATH ?? "data/narzaalai.db");
  }
  return globalForDb.__narzaalaiDb;
}

export function useDb(db: Db): void {
  globalForDb.__narzaalaiDb = db;
}

export const newId = (): string => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();

/** Allocates the next human-readable request reference, e.g. NZ-2026-000012. Atomic per call. */
export function nextReference(db: Db, prefix = "NZ", date = new Date()): string {
  const year = date.getUTCFullYear();
  const row = db.transaction(() => {
    db.prepare(
      "INSERT INTO reference_counters (year, last_value) VALUES (?, 1) ON CONFLICT(year) DO UPDATE SET last_value = last_value + 1",
    ).run(year);
    return db.prepare("SELECT last_value AS v FROM reference_counters WHERE year = ?").get(year) as { v: number };
  })();
  return `${prefix}-${year}-${String(row.v).padStart(6, "0")}`;
}
