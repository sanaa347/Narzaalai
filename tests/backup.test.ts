import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupDatabase } from "@/lib/db/backup";
import { openDb } from "@/lib/db";
import { makeStaff } from "./helpers";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "nz-backup-")); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function liveDb() {
  const file = path.join(dir, "live.db");
  const db = openDb(file);
  return { file, db };
}

describe("database backup", () => {
  it("captures committed data that is still in the WAL file, and the copy is a verified, usable database", async () => {
    const { file, db } = liveDb();
    makeStaff(db); // committed through the open WAL connection; the main .db file may not contain it yet
    const user = db.prepare("SELECT email FROM users").get() as { email: string };
    const res = await backupDatabase(file, path.join(dir, "b"), { now: new Date("2026-10-28T10:00:00Z") });
    expect(path.basename(res.file)).toBe("narzaalai-20261028T100000Z.db");
    expect(res.integrity).toBe("ok");
    expect(res.foreignKeyViolations).toBe(0);
    expect(fs.readdirSync(path.join(dir, "b"))).toEqual(["narzaalai-20261028T100000Z.db"]); // one self-contained file, no -wal/-shm
    const copy = new Database(res.file, { readonly: true });
    expect((copy.prepare("SELECT email FROM users").get() as { email: string }).email).toBe(user.email);
    expect((copy.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number }).n).toBeGreaterThan(0);
    copy.close();
    db.close();
  });

  it("never overwrites an existing backup and fails clearly when the source is missing", async () => {
    const { file, db } = liveDb();
    const when = new Date("2026-10-28T10:00:00Z");
    await backupDatabase(file, path.join(dir, "b"), { now: when });
    await expect(backupDatabase(file, path.join(dir, "b"), { now: when })).rejects.toThrow(/already exists/);
    await expect(backupDatabase(path.join(dir, "missing.db"), path.join(dir, "b"))).rejects.toThrow(/not found/);
    db.close();
  });

  it("prunes only its own old backups beyond `keep`, never unrelated files", async () => {
    const { file, db } = liveDb();
    const out = path.join(dir, "b");
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, "notes.txt"), "keep me");
    for (const d of ["2026-10-26", "2026-10-27", "2026-10-28"]) await backupDatabase(file, out, { now: new Date(`${d}T01:00:00Z`), keep: 2 });
    const left = fs.readdirSync(out).sort();
    expect(left).toEqual(["narzaalai-20261027T010000Z.db", "narzaalai-20261028T010000Z.db", "notes.txt"]);
    db.close();
  });
});
