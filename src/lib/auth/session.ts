import type { Db } from "@/lib/db";
import { newId } from "@/lib/db";
import { hashToken, newSessionToken, verifyPassword } from "./password";
import type { Actor, Role } from "./permissions";

export const SESSION_COOKIE = "nz_session";
const SESSION_DAYS = 14;

export interface SessionUser extends Actor {
  fullName: string;
  email: string;
}

export function createSession(db: Db, userId: string): { token: string; expiresAt: Date } {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString()); // housekeeping: expired rows would otherwise accumulate
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    hashToken(token),
    userId,
    expiresAt.toISOString(),
  );
  return { token, expiresAt };
}

export function destroySession(db: Db, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
  supplier_id: string | null;
}

export function loadActor(db: Db, userId: string): SessionUser | null {
  const u = db.prepare("SELECT id, full_name, email, role, status, supplier_id FROM users WHERE id = ?").get(userId) as UserRow | undefined;
  if (!u || u.status !== "active") return null;
  const orgIds = (db.prepare("SELECT org_id FROM org_members WHERE user_id = ?").all(userId) as { org_id: string }[]).map((r) => r.org_id);
  return { id: u.id, fullName: u.full_name, email: u.email, role: u.role, status: u.status, supplierId: u.supplier_id, orgIds };
}

export function userFromToken(db: Db, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(hashToken(token)) as { user_id: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    return null;
  }
  return loadActor(db, row.user_id);
}

/** Constant-ish-time login: always runs a hash comparison to avoid trivially revealing which emails exist. */
const DUMMY_HASH = "scrypt$00000000000000000000000000000000$" + "00".repeat(64);

export function authenticate(db: Db, email: string, password: string): SessionUser | null {
  const row = db.prepare("SELECT id, password_hash, status FROM users WHERE email = ?").get(email.trim()) as
    | { id: string; password_hash: string; status: string }
    | undefined;
  const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok || row.status !== "active") return null;
  return loadActor(db, row.id);
}

export { newId };
