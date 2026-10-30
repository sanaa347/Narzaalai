import fs from "node:fs";
import Database from "better-sqlite3";

/**
 * True when the SQLite file at `file` exists and might hold anything other than seeded demo data
 * (a non-demo user, organization or project) or cannot be inspected safely. Used to stop `seed --reset`
 * from deleting a database that contains real records.
 */
export function databaseMayHoldRealData(file: string): boolean {
  if (!fs.existsSync(file)) return false;
  let db: Database.Database | null = null;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const counts = ["users", "organizations", "projects"].map(
      (t) => (db!.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE is_demo = 0`).get() as { n: number }).n,
    );
    return counts.some((n) => n > 0);
  } catch {
    return true; // unreadable or unexpected schema: assume it is valuable
  } finally {
    db?.close();
  }
}
