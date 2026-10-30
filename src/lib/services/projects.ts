import type { Db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { canViewOrgData, isStaff } from "@/lib/auth/permissions";
import { requireStaffActor } from "./actors";
import { localDate, startOfLocalDay } from "@/lib/domain/dates";
import { attentionFlags, type AttentionFlag } from "@/lib/domain/attention";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/domain/status";
import type {
  AssessmentRow, DocumentRow, EnergyProfileRow, EventRow, InfoRequestRow, OrgRow, ProjectRow, SiteRow, NoteRow, AssetRow, WarrantyRow, TicketRow,
} from "@/lib/db/types";

export const COMMISSIONING_DOC_TYPES = ["commissioning_report", "handover"] as const;
const QUIET_SQL = "('CANCELLED','REJECTED','IN_SERVICE','MAINTENANCE')";

export interface OpsProjectRow {
  id: string; reference: string; status: ProjectStatus; created_at: string; updated_at: string; is_demo: number;
  next_action_due: string | null; blocked_reason: string | null; assigned_to: string | null; assigned_name: string | null;
  org_id: string; org_name: string; org_type: "household" | "business"; contact_name: string | null; contact_phone: string | null;
  province: string; property_type: string; assessment_id: string; verification_state: AssessmentRow["verification_state"];
  open_info: number; has_commissioning: number; quote_count: number; flags: AttentionFlag[];
}

export interface OpsFilters {
  q?: string;
  status?: string;
  /** Additive: restrict to any of these statuses (used by the inbox "all open" chip). */
  statuses?: string[];
  owner?: string; // "me" | "unassigned" | user id
  attention?: "overdue" | "blocked" | "unassigned" | "open_info" | "any";
  page?: number;
  pageSize?: number;
}

const BASE_FROM = `
  FROM projects p
  JOIN organizations o ON o.id = p.org_id
  JOIN sites s ON s.id = p.site_id
  JOIN assessments a ON a.id = p.assessment_id
  LEFT JOIN users u ON u.id = p.assigned_to`;

export function listOpsProjects(db: Db, actor: SessionUser, f: OpsFilters = {}, today = new Date()): { rows: OpsProjectRow[]; total: number; page: number; pageSize: number } {
  // Defence in depth: the page already requires staff, but this query returns every customer's project.
  requireStaffActor(actor);
  const where: string[] = [];
  const params: unknown[] = [];
  const todayIso = localDate(today);
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[%_]/g, (m) => "\\" + m)}%`;
    where.push("(p.reference LIKE ? ESCAPE '\\' OR a.reference LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\' OR o.contact_name LIKE ? ESCAPE '\\' OR o.contact_email LIKE ? ESCAPE '\\' OR o.contact_phone LIKE ? ESCAPE '\\' OR s.province LIKE ? ESCAPE '\\')");
    params.push(like, like, like, like, like, like, like);
  }
  if (f.status && (PROJECT_STATUSES as readonly string[]).includes(f.status)) { where.push("p.status = ?"); params.push(f.status); }
  if (f.statuses?.length) {
    const valid = f.statuses.filter((x) => (PROJECT_STATUSES as readonly string[]).includes(x));
    if (valid.length) { where.push(`p.status IN (${valid.map(() => "?").join(",")})`); params.push(...valid); }
  }
  if (f.owner === "me") { where.push("p.assigned_to = ?"); params.push(actor.id); }
  else if (f.owner === "unassigned") where.push("p.assigned_to IS NULL");
  else if (f.owner) { where.push("p.assigned_to = ?"); params.push(f.owner); }
  switch (f.attention) {
    case "overdue": where.push(`p.next_action_due < ? AND p.status NOT IN ${QUIET_SQL}`); params.push(todayIso); break;
    case "blocked": where.push("p.blocked_reason IS NOT NULL AND trim(p.blocked_reason) <> '' AND p.status NOT IN ('CANCELLED','REJECTED')"); break;
    case "unassigned": where.push(`p.assigned_to IS NULL AND p.status NOT IN ${QUIET_SQL}`); break;
    case "open_info": where.push("EXISTS (SELECT 1 FROM info_requests i WHERE i.project_id = p.id AND i.status = 'open')"); break;
    default: break;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pageSize = Math.min(Math.max(f.pageSize ?? 20, 1), 100);
  const page = Math.max(f.page ?? 1, 1);
  const total = (db.prepare(`SELECT COUNT(*) AS n ${BASE_FROM} ${whereSql}`).get(...params) as { n: number }).n;
  const raw = db
    .prepare(
      `SELECT p.id, p.reference, p.status, p.created_at, p.updated_at, p.is_demo, p.next_action_due, p.blocked_reason, p.assigned_to,
        u.full_name AS assigned_name, o.id AS org_id, o.name AS org_name, o.organization_type AS org_type, o.contact_name, o.contact_phone,
        s.province, s.property_type, a.id AS assessment_id, a.verification_state,
        (SELECT COUNT(*) FROM info_requests i WHERE i.project_id = p.id AND i.status = 'open') AS open_info,
        (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id AND d.doc_type IN ('commissioning_report','handover')) AS has_commissioning,
        (SELECT COUNT(*) FROM quotes q WHERE q.project_id = p.id AND q.archived_at IS NULL) AS quote_count
       ${BASE_FROM} ${whereSql} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as Omit<OpsProjectRow, "flags">[];
  const rows = raw.map((r) => ({
    ...r,
    flags: attentionFlags(
      { status: r.status, nextActionDue: r.next_action_due, blockedReason: r.blocked_reason, assignedTo: r.assigned_to, openInfoRequests: r.open_info, hasCommissioningEvidence: r.has_commissioning > 0 },
      today,
    ),
  }));
  return { rows, total, page, pageSize };
}

export interface OpsOverview {
  total: number;
  byStatus: { status: ProjectStatus; n: number }[];
  overdue: number; blocked: number; unassigned: number; openInfo: number; newToday: number;
  suppliers: number; products: number; quotes: number; expiredQuotes: number; demoProjects: number;
}

export function opsOverview(db: Db, today = new Date()): OpsOverview {
  const todayIso = localDate(today);
  const n = (sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { n: number }).n;
  const byStatus = db.prepare("SELECT status, COUNT(*) AS n FROM projects GROUP BY status").all() as { status: ProjectStatus; n: number }[];
  byStatus.sort((a, b) => PROJECT_STATUSES.indexOf(a.status) - PROJECT_STATUSES.indexOf(b.status));
  return {
    total: n("SELECT COUNT(*) AS n FROM projects"),
    byStatus,
    overdue: n(`SELECT COUNT(*) AS n FROM projects WHERE next_action_due < ? AND status NOT IN ${QUIET_SQL}`, todayIso),
    blocked: n("SELECT COUNT(*) AS n FROM projects WHERE blocked_reason IS NOT NULL AND trim(blocked_reason) <> '' AND status NOT IN ('CANCELLED','REJECTED')"),
    unassigned: n(`SELECT COUNT(*) AS n FROM projects WHERE assigned_to IS NULL AND status NOT IN ${QUIET_SQL}`),
    openInfo: n("SELECT COUNT(*) AS n FROM info_requests WHERE status = 'open'"),
    // created_at is a UTC instant; "today" is the Ulaanbaatar calendar day, so compare against that day's start instant.
    newToday: n("SELECT COUNT(*) AS n FROM projects WHERE created_at >= ?", startOfLocalDay(todayIso).toISOString()),
    suppliers: n("SELECT COUNT(*) AS n FROM suppliers WHERE archived_at IS NULL"),
    products: n("SELECT COUNT(*) AS n FROM products WHERE archived_at IS NULL"),
    quotes: n("SELECT COUNT(*) AS n FROM quotes WHERE archived_at IS NULL"),
    expiredQuotes: n("SELECT COUNT(*) AS n FROM quotes WHERE archived_at IS NULL AND source_type = 'supplier_quotation' AND valid_until IS NOT NULL AND valid_until < ?", todayIso),
    demoProjects: n("SELECT COUNT(*) AS n FROM projects WHERE is_demo = 1"),
  };
}

export function listCustomerProjects(db: Db, actor: SessionUser) {
  if (actor.role !== "customer" || actor.orgIds.length === 0) return [];
  const marks = actor.orgIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT p.id, p.reference, p.status, p.created_at, p.updated_at, p.is_demo, o.name AS org_name, o.organization_type AS org_type,
        s.province, s.property_type,
        (SELECT COUNT(*) FROM info_requests i WHERE i.project_id = p.id AND i.status = 'open') AS open_info
       FROM projects p JOIN organizations o ON o.id = p.org_id JOIN sites s ON s.id = p.site_id
       WHERE p.org_id IN (${marks}) ORDER BY p.created_at DESC`,
    )
    .all(...actor.orgIds) as {
    id: string; reference: string; status: ProjectStatus; created_at: string; updated_at: string; is_demo: number; org_name: string;
    org_type: "household" | "business"; province: string; property_type: string; open_info: number;
  }[];
}

/** Returns the project only when the actor may see it. Customers: own organizations only. */
export function getProjectForActor(db: Db, actor: SessionUser | null, id: string): ProjectRow | null {
  if (!actor) return null;
  const p = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
  if (!p || !canViewOrgData(actor, p.org_id)) return null;
  return p;
}

export interface EventView extends Omit<EventRow, "note"> { note: string | null }

export interface ProjectBundle {
  project: ProjectRow;
  org: OrgRow;
  site: SiteRow;
  energy: EnergyProfileRow;
  assessment: AssessmentRow;
  events: EventView[];
  infoRequests: InfoRequestRow[];
  documents: DocumentRow[];
  assets: (AssetRow & { warranties: WarrantyRow[] })[];
  tickets: TicketRow[];
  notes: (NoteRow & { author_name: string })[]; // empty for customers
  assignedName: string | null;
}

/** Everything about one project, filtered to what the actor may see (customers never receive internal notes/events/documents). */
export function getProjectBundle(db: Db, actor: SessionUser | null, id: string): ProjectBundle | null {
  const project = getProjectForActor(db, actor, id);
  if (!project || !actor) return null;
  const staff = isStaff(actor);
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(project.org_id) as OrgRow;
  const site = db.prepare("SELECT * FROM sites WHERE id = ?").get(project.site_id) as SiteRow;
  const assessment = db.prepare("SELECT * FROM assessments WHERE id = ?").get(project.assessment_id) as AssessmentRow;
  const energy = db.prepare("SELECT * FROM energy_profiles WHERE id = ?").get(assessment.energy_profile_id) as EnergyProfileRow;

  let events = db.prepare("SELECT * FROM project_events WHERE project_id = ? ORDER BY created_at, rowid").all(id) as EventRow[];
  if (!staff) events = events.filter((e) => e.customer_visible === 1);
  const eventViews: EventView[] = events.map((e) => ({ ...e, note: staff || e.note_customer_visible === 1 ? e.note : null }));

  const infoRequests = db.prepare("SELECT * FROM info_requests WHERE project_id = ? ORDER BY created_at").all(id) as InfoRequestRow[];
  const documents = (db.prepare("SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC").all(id) as DocumentRow[]).filter(
    (d) => staff || d.access === "customer_visible",
  );
  const assets = (db.prepare("SELECT * FROM installed_assets WHERE project_id = ? ORDER BY created_at").all(id) as AssetRow[]).map((a) => ({
    ...a,
    warranties: db.prepare("SELECT * FROM warranty_records WHERE asset_id = ? ORDER BY created_at").all(a.id) as WarrantyRow[],
  }));
  const tickets = db.prepare("SELECT * FROM service_tickets WHERE project_id = ? ORDER BY created_at DESC").all(id) as TicketRow[];
  const notes = staff
    ? (db
        .prepare("SELECT n.*, u.full_name AS author_name FROM assessment_notes n JOIN users u ON u.id = n.author_id WHERE n.assessment_id = ? ORDER BY n.created_at DESC")
        .all(assessment.id) as (NoteRow & { author_name: string })[])
    : [];
  const assignedName = project.assigned_to
    ? ((db.prepare("SELECT full_name FROM users WHERE id = ?").get(project.assigned_to) as { full_name: string } | undefined)?.full_name ?? null)
    : null;
  return { project, org, site, energy, assessment, events: eventViews, infoRequests, documents, assets, tickets: staff ? tickets : [], notes, assignedName };
}

export function listStaffUsers(db: Db): { id: string; full_name: string; email: string; role: string; status: string; is_demo: number }[] {
  return db.prepare("SELECT id, full_name, email, role, status, is_demo FROM users WHERE role IN ('staff','admin') ORDER BY full_name").all() as never;
}

export function listOrganizations(db: Db, q?: string) {
  const like = q?.trim() ? `%${q.trim().replace(/[%_]/g, (m) => "\\" + m)}%` : null;
  return db
    .prepare(
      `SELECT o.id, o.name, o.organization_type, o.contact_name, o.contact_phone, o.contact_email, o.is_demo, o.created_at,
        (SELECT COUNT(*) FROM sites s WHERE s.org_id = o.id) AS site_count,
        (SELECT COUNT(*) FROM projects p WHERE p.org_id = o.id) AS project_count
       FROM organizations o
       ${like ? "WHERE o.name LIKE ? ESCAPE '\\' OR o.contact_name LIKE ? ESCAPE '\\' OR o.contact_email LIKE ? ESCAPE '\\' OR o.contact_phone LIKE ? ESCAPE '\\'" : ""}
       ORDER BY o.created_at DESC`,
    )
    .all(...(like ? [like, like, like, like] : [])) as {
    id: string; name: string; organization_type: "household" | "business"; contact_name: string | null; contact_phone: string | null;
    contact_email: string | null; is_demo: number; created_at: string; site_count: number; project_count: number;
  }[];
}
