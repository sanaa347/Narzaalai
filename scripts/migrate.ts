/* Applies SQL migrations to the configured database and (optionally) bootstraps the first admin. */
import { openDb } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { newId } from "../src/lib/db";

const file = process.env.NARZAALAI_DB_PATH ?? "data/narzaalai.db";
const db = openDb(file); // opening runs pending migrations
const applied = db.prepare("SELECT name FROM schema_migrations ORDER BY name").all() as { name: string }[];
console.log(`Database: ${file}`);
console.log(`Migrations applied: ${applied.map((a) => a.name).join(", ")}`);

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (email && password) {
  const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get();
  if (hasAdmin) {
    console.log("Admin already exists; bootstrap skipped.");
  } else if (password.length < 12) {
    console.error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters. Admin not created.");
    process.exitCode = 1;
  } else {
    db.prepare("INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?,?,?,?, 'admin')").run(newId(), "Administrator", email, hashPassword(password));
    console.log(`Admin created: ${email}`);
  }
}
db.close();
