"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { authenticate, createSession, destroySession, SESSION_COOKIE } from "@/lib/auth/session";
import { clientIp } from "@/lib/auth/client-ip";
import { clearLoginFailures, hitLimit, loginBlocked, recordLoginFailure } from "@/lib/auth/ratelimit";
import { isStaff, portalFor } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current";
import { safeNext } from "@/lib/format";
import { DomainError } from "@/lib/domain/errors";
import { submitAssessment } from "@/lib/services/assessment";
import type { FormState } from "./state";

async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? ""));
  if (!email || !password) return { ok: false, message: "Имэйл болон нууц үгээ оруулна уу.", values: { email } };

  const h = await headers();
  const ip = clientIp(h);
  // An unknown address (no trusted proxy header) must not become one shared bucket that locks every user out.
  const keys = ip === "unknown" ? [`email:${email}`] : [`email:${email}`, `ip:${ip}`];
  if (keys.some((k) => loginBlocked(k))) {
    return { ok: false, message: "Хэт олон удаа буруу оролдлоо. 15 минутын дараа дахин оролдоно уу.", values: { email } };
  }

  const db = getDb();
  const user = authenticate(db, email, password);
  if (!user) {
    keys.forEach((k) => recordLoginFailure(k));
    return { ok: false, message: "Имэйл эсвэл нууц үг буруу байна.", values: { email } };
  }
  if (!portalFor(user)) {
    return { ok: false, message: "Энэ төрлийн бүртгэлд одоогоор нэвтрэх боломжгүй байна.", values: { email } };
  }
  keys.forEach((k) => clearLoginFailures(k));
  const { token, expiresAt } = createSession(db, user.id);
  await setSessionCookie(token, expiresAt);
  const home = isStaff(user) ? "/ops" : "/dashboard";
  // Staff may only be sent into /ops, customers only into /dashboard, so a crafted ?next= cannot cross areas.
  const allowedPrefix = isStaff(user) ? "/ops" : "/dashboard";
  redirect(next && next.startsWith(allowedPrefix) ? next : home);
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) destroySession(getDb(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/");
}

const SUBMIT_MAX_PER_HOUR = 20;

export interface SubmitAssessmentResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  redirectTo?: string;
}

/**
 * Public assessment submission. Validated again on the server; creates the customer account (when not signed in),
 * the organization/site/energy profile/assessment/project in ONE transaction, then signs the new customer in.
 * Submitting never grants access to anything except the customer's own newly created records.
 */
export async function submitAssessmentAction(values: Record<string, unknown>, account: { fullName: string; phone: string; email: string; password: string } | null): Promise<SubmitAssessmentResult> {
  const actor = await getCurrentUser();
  if (!actor) {
    // Public endpoint: cap attempts per client address so it cannot be used to mass-create accounts and projects.
    const h = await headers();
    const ip = clientIp(h);
    if (hitLimit("submit", ip, SUBMIT_MAX_PER_HOUR, 3_600_000)) {
      return { ok: false, message: "Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу." };
    }
  }
  try {
    const db = getDb();
    const res = submitAssessment(db, values, actor ? null : account, actor);
    if (res.createdAccount) {
      const { token, expiresAt } = createSession(db, res.userId);
      await setSessionCookie(token, expiresAt);
    }
    return { ok: true, redirectTo: `/dashboard/projects/${res.projectId}?submitted=1` };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
}
