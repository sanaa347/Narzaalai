import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE, userFromToken, type SessionUser } from "./session";
import { isStaff } from "./permissions";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return userFromToken(getDb(), jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** Operations area gate. Non-staff are sent away; the check always runs on the server. */
export async function requireStaff(): Promise<SessionUser> {
  const u = await requireUser();
  if (!isStaff(u)) redirect("/dashboard");
  return u;
}

export async function requireCustomer(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "customer") {
    if (isStaff(u)) redirect("/ops");
    notFound(); // roles without a portal must never bounce between /login and /dashboard
  }
  return u;
}
