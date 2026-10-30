import type { Db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import type { OrgRow, SiteRow } from "@/lib/db/types";
import type { ProjectStatus } from "@/lib/domain/status";
import { DomainError } from "@/lib/domain/errors";
import { requireStaffActor } from "./actors";

export interface OrganizationDetail {
  org: OrgRow;
  members: { user_id: string; full_name: string; email: string; phone: string | null; member_role: string; status: string }[];
  sites: SiteRow[];
  projects: { id: string; reference: string; status: ProjectStatus; created_at: string; is_demo: number; site_id: string }[];
  documentCounts: { total: number; customerVisible: number };
}

/** Staff-only organization record. Customers cannot call this (they only ever see their own project bundles). */
export function getOrganizationDetail(db: Db, actor: SessionUser | null, id: string): OrganizationDetail | null {
  requireStaffActor(actor);
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(id) as OrgRow | undefined;
  if (!org) return null;
  const members = db
    .prepare(
      `SELECT u.id AS user_id, u.full_name, u.email, u.phone, m.member_role, u.status FROM org_members m JOIN users u ON u.id = m.user_id
       WHERE m.org_id = ? ORDER BY u.full_name`,
    )
    .all(id) as OrganizationDetail["members"];
  const sites = db.prepare("SELECT * FROM sites WHERE org_id = ? ORDER BY created_at").all(id) as SiteRow[];
  const projects = db
    .prepare("SELECT id, reference, status, created_at, is_demo, site_id FROM projects WHERE org_id = ? ORDER BY created_at DESC")
    .all(id) as OrganizationDetail["projects"];
  const d = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN access='customer_visible' THEN 1 ELSE 0 END),0) AS visible
       FROM documents WHERE project_id IN (SELECT id FROM projects WHERE org_id = ?)`,
    )
    .get(id) as { total: number; visible: number };
  return { org, members, sites, projects, documentCounts: { total: d.total, customerVisible: d.visible } };
}

export function requireOrganizationDetail(db: Db, actor: SessionUser | null, id: string): OrganizationDetail {
  const d = getOrganizationDetail(db, actor, id);
  if (!d) throw new DomainError("Organization not found.", "not_found");
  return d;
}
