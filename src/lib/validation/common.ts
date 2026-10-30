import { z } from "zod";

/** Form values arrive as strings; empty string means "not provided". */
export const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
export const optText = (max = 2000) => z.preprocess(emptyToUndef, z.string().trim().max(max).optional());
export const reqText = (msg: string, max = 500) => z.string({ error: msg }).trim().min(1, msg).max(max);
export const optNum = (min: number, max: number, msg: string) =>
  z.preprocess(
    (v) => {
      const e = emptyToUndef(v);
      if (e === undefined || e === null) return undefined;
      if (typeof e === "string") return Number(e.replace(/[\s,]/g, ""));
      return e;
    },
    z.number({ error: msg }).min(min, msg).max(max, msg).optional(),
  );
export const isoDate = (msg: string) => z.string({ error: msg }).regex(/^\d{4}-\d{2}-\d{2}$/, msg).refine((s) => !Number.isNaN(Date.parse(s)), msg);
export const optIsoDate = (msg: string) => z.preprocess(emptyToUndef, isoDate(msg).optional());

import { DomainError } from "@/lib/domain/errors";

export function parseInput<S extends z.ZodType>(schema: S, raw: unknown, message = "Please correct the highlighted fields."): z.output<S> {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in fields)) fields[key] = issue.message;
  }
  throw new DomainError(message, "invalid", fields);
}
