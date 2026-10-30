import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, type Db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current";
import type { SessionUser } from "@/lib/auth/session";
import { isAdmin, isStaff } from "@/lib/auth/permissions";
import { DomainError } from "@/lib/domain/errors";
import type { FormState } from "./state";

export type ActionAs = "staff" | "admin" | "customer" | "user";

export interface ActionCtx {
  db: Db;
  actor: SessionUser;
  form: FormData;
  /** Trimmed string value ("" when absent or a file). */
  str(name: string): string;
  /** Raw string or undefined when empty — convenient for optional service inputs. */
  opt(name: string): string | undefined;
  /** All values of a multi-value field (e.g. checkbox group). */
  all(name: string): string[];
  /** First uploaded file with content, or null. */
  file(name: string): File | null;
}

export type ActionResult = string | { message?: string; redirectTo?: string } | void;

const NO_PERMISSION: Record<"mn" | "en", string> = { mn: "Таны эрх энэ үйлдэлд хүрэлцэхгүй байна.", en: "You do not have permission to perform this action." };

function echoValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string" || k.startsWith("$ACTION") || /password/i.test(k)) continue;
    out[k] = k in out ? `${out[k]},${v}` : v;
  }
  return out;
}

/**
 * Runs one mutation as a server action: authenticates the caller from the session cookie, checks the role,
 * runs `fn`, and converts expected DomainErrors into form state (never a stack trace).
 * Unexpected errors are rethrown so Next's error boundary shows a generic failure and the bug is logged.
 * Authorization is ALWAYS enforced again inside the services; the role check here only avoids a wasted call.
 */
export async function runAction(form: FormData, as: ActionAs, fn: (ctx: ActionCtx) => Promise<ActionResult> | ActionResult): Promise<FormState> {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  const lang = as === "customer" ? "mn" : "en";
  const allowed = as === "staff" ? isStaff(actor) : as === "admin" ? isAdmin(actor) : as === "customer" ? actor.role === "customer" : true;
  if (!allowed) return { ok: false, message: NO_PERMISSION[lang] };

  const ctx: ActionCtx = {
    db: getDb(),
    actor,
    form,
    str: (n) => {
      const v = form.get(n);
      return typeof v === "string" ? v.trim() : "";
    },
    opt: (n) => {
      const v = form.get(n);
      return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
    },
    all: (n) => form.getAll(n).filter((v): v is string => typeof v === "string"),
    file: (n) => {
      const v = form.get(n);
      return v instanceof File && v.size > 0 ? v : null;
    },
  };

  let result: ActionResult;
  try {
    result = await fn(ctx);
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, message: e.message, fieldErrors: e.fieldErrors, values: echoValues(form) };
    throw e;
  }
  revalidatePath("/", "layout");
  const r = typeof result === "string" ? { message: result } : (result ?? {});
  if (r.redirectTo) redirect(r.redirectTo);
  return { ok: true, message: r.message };
}
