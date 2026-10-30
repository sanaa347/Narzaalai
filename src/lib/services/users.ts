import { z } from "zod";
import type { Db } from "@/lib/db";
import { newId, nowIso } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { SessionUser } from "@/lib/auth/session";
import { DomainError } from "@/lib/domain/errors";
import { parseInput, reqText } from "@/lib/validation/common";
import { requireAdminActor } from "./actors";

const staffSchema = z.object({
  fullName: reqText("Full name is required", 120),
  email: z.string({ error: "Email is required" }).trim().toLowerCase().email("Invalid email").max(200),
  password: z.string({ error: "Password is required" }).min(12, "Use at least 12 characters for staff accounts").max(200),
  role: z.enum(["staff", "admin"], { error: "Choose a role" }),
});

export function createStaffUser(db: Db, actor: SessionUser | null, raw: unknown): string {
  requireAdminActor(actor);
  const v = parseInput(staffSchema, raw);
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(v.email)) throw new DomainError("This email is already registered.", "conflict", { email: "Already registered" });
  const id = newId();
  db.prepare("INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?,?,?,?,?)").run(id, v.fullName, v.email, hashPassword(v.password), v.role);
  return id;
}

export function setUserStatus(db: Db, actor: SessionUser | null, userId: string, status: "active" | "disabled"): void {
  const admin = requireAdminActor(actor);
  if (userId === admin.id) throw new DomainError("You cannot change your own account status.", "workflow");
  const u = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as { role: string } | undefined;
  if (!u) throw new DomainError("User not found.", "not_found");
  db.transaction(() => {
    db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), userId);
    if (status === "disabled") db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  })();
}
