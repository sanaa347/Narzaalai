/**
 * Recreates the E2E scratch database from scratch. Refuses to run unless both the database and the upload
 * directory are inside <repo>/.tmp/e2e/, so it can never delete development or production data.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { openDb, newId } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

const scratch = path.resolve(process.cwd(), ".tmp", "e2e");
const inside = (p: string | undefined) => !!p && path.resolve(p).startsWith(scratch + path.sep);

if (!inside(process.env.NARZAALAI_DB_PATH) || !inside(process.env.NARZAALAI_UPLOAD_DIR)) {
  console.error(`e2e/prepare.ts refused: NARZAALAI_DB_PATH and NARZAALAI_UPLOAD_DIR must be inside ${scratch}.`);
  process.exit(1);
}
if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 12) {
  console.error("e2e/prepare.ts refused: SEED_PASSWORD (>= 12 chars) is required.");
  process.exit(1);
}

fs.rmSync(scratch, { recursive: true, force: true });
fs.mkdirSync(scratch, { recursive: true });

const seed = spawnSync("npx", ["tsx", "scripts/seed.ts", "--reset"], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development" },
});
if (seed.status !== 0) process.exit(seed.status ?? 1);

// A user whose role has no portal (suppliers have no UI yet). Used to prove such a login is refused, not looped.
const db = openDb(process.env.NARZAALAI_DB_PATH!);
const supplierId = newId();
db.prepare("INSERT INTO suppliers (id, company_name, is_demo) VALUES (?, 'ДЕМО E2E supplier-role test', 1)").run(supplierId);
db.prepare("INSERT INTO users (id, full_name, email, password_hash, role, supplier_id, is_demo) VALUES (?,?,?,?,?,?,1)").run(
  newId(), "ДЕМО Supplier Role", "supplier-role@e2e.narzaalai.test", hashPassword(process.env.SEED_PASSWORD), "supplier", supplierId,
);
db.close();
console.log("E2E scratch database ready.");
