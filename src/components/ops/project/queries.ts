import type { Db } from "@/lib/db";
import { parseJson } from "@/lib/format";
import type { OpsFilters } from "@/lib/services/projects";

export type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function readFilters(sp: SP): { q: string; status: string; owner: string; attention: string; page: number } {
  return { q: one(sp.q) ?? "", status: one(sp.status) ?? "", owner: one(sp.owner) ?? "", attention: one(sp.attention) ?? "", page: Math.max(1, Number(one(sp.page)) || 1) };
}

export function toOpsFilters(f: ReturnType<typeof readFilters>): OpsFilters {
  return {
    q: f.q || undefined, status: f.status || undefined, owner: f.owner || undefined,
    attention: (f.attention || undefined) as OpsFilters["attention"], page: f.page, pageSize: 20,
  };
}

/** assessmentId -> number of data points the customer has not supplied. */
export function missingCounts(db: Db, assessmentIds: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (!assessmentIds.length) return out;
  const rows = db.prepare(`SELECT id, missing_data FROM assessments WHERE id IN (${assessmentIds.map(() => "?").join(",")})`).all(...assessmentIds) as { id: string; missing_data: string }[];
  for (const r of rows) out.set(r.id, parseJson<string[]>(r.missing_data, []).length);
  return out;
}
