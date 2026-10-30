import "server-only";
import type { Db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { listSuppliers } from "@/lib/services/suppliers";

/** Option lists for the quotation form: active suppliers and open projects. */
export function quoteFormOptions(db: Db, actor: SessionUser) {
  const suppliers = listSuppliers(db, actor).filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.company_name, isDemo: s.is_demo === 1 }));
  const projects = (
    db
      .prepare(
        `SELECT p.id, p.reference, o.name AS org_name FROM projects p JOIN organizations o ON o.id = p.org_id
         WHERE p.status NOT IN ('CANCELLED','REJECTED') ORDER BY p.created_at DESC LIMIT 300`,
      )
      .all() as { id: string; reference: string; org_name: string }[]
  ).map((p) => ({ id: p.id, label: `${p.reference} — ${p.org_name}` }));
  return { suppliers, projects };
}
