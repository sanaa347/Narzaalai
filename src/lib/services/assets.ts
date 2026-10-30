import { z } from "zod";
import type { Db } from "@/lib/db";
import { newId, nowIso } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { canApproveAsCustomer, isStaff } from "@/lib/auth/permissions";
import { DomainError } from "@/lib/domain/errors";
import type { AssetRow, DocumentRow, ProjectRow, TicketRow } from "@/lib/db/types";
import { emptyToUndef, optIsoDate, optText, parseInput, reqText } from "@/lib/validation/common";
import { requireStaffActor } from "./actors";
import { PRODUCT_CATEGORIES } from "./products";
import { addEvent } from "./workflow";
import { COMMISSIONING_DOC_TYPES } from "./projects";

const POST_INSTALL = ["INSTALLATION", "COMMISSIONING", "COMPLETED", "IN_SERVICE", "MAINTENANCE"];

const assetSchema = z.object({
  category: z.enum(PRODUCT_CATEGORIES, { error: "Choose a category" }),
  manufacturer: reqText("Manufacturer is required", 200),
  model: reqText("Model is required", 200),
  serialNumber: optText(100), // only from a real nameplate/document; never generated
  installationDate: optIsoDate("Use YYYY-MM-DD"),
  installerSupplierId: z.preprocess(emptyToUndef, z.string().optional()),
  commissioningState: z.enum(["not_commissioned", "commissioned", "failed"]).default("not_commissioned"),
  notes: optText(2000),
});

export function addAsset(db: Db, actor: SessionUser | null, projectId: string, raw: unknown): string {
  const staff = requireStaffActor(actor);
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
  if (!project) throw new DomainError("Project not found.", "not_found");
  if (!POST_INSTALL.includes(project.status)) throw new DomainError("Installed equipment can be recorded once the project reaches INSTALLATION.", "workflow");
  const v = parseInput(assetSchema, raw);
  if (v.commissioningState === "commissioned") {
    const marks = COMMISSIONING_DOC_TYPES.map(() => "?").join(",");
    const ev = db.prepare(`SELECT 1 FROM documents WHERE project_id = ? AND doc_type IN (${marks})`).get(projectId, ...COMMISSIONING_DOC_TYPES);
    if (!ev) throw new DomainError("Upload a commissioning report or handover document before marking equipment as commissioned.", "workflow", { commissioningState: "Commissioning evidence required" });
  }
  if (v.installerSupplierId && !db.prepare("SELECT 1 FROM suppliers WHERE id = ?").get(v.installerSupplierId)) throw new DomainError("Installer not found.", "invalid", { installerSupplierId: "Installer not found" });
  const id = newId();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO installed_assets (id, project_id, site_id, category, manufacturer, model, serial_number, installation_date, installer_supplier_id, commissioning_state, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, projectId, project.site_id, v.category, v.manufacturer, v.model, v.serialNumber ?? null, v.installationDate ?? null, v.installerSupplierId ?? null, v.commissioningState, v.notes ?? null);
    addEvent(db, { projectId, type: "MILESTONE", actor: staff, note: `Installed equipment recorded: ${v.manufacturer} ${v.model}`, customerVisible: false });
  })();
  return id;
}

const warrantySchema = z
  .object({
    provider: reqText("Warranty provider is required", 200),
    terms: optText(3000),
    startDate: optIsoDate("Use YYYY-MM-DD"),
    endDate: optIsoDate("Use YYYY-MM-DD"),
    documentId: z.preprocess(emptyToUndef, z.string().optional()),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date cannot be before start date" });
  });

export function addWarranty(db: Db, actor: SessionUser | null, assetId: string, raw: unknown): string {
  requireStaffActor(actor);
  const asset = db.prepare("SELECT * FROM installed_assets WHERE id = ?").get(assetId) as AssetRow | undefined;
  if (!asset) throw new DomainError("Asset not found.", "not_found");
  const v = parseInput(warrantySchema, raw);
  if (v.documentId) {
    const d = db.prepare("SELECT * FROM documents WHERE id = ? AND project_id = ?").get(v.documentId, asset.project_id) as DocumentRow | undefined;
    if (!d) throw new DomainError("The selected document does not belong to this project.", "invalid", { documentId: "Document not found on this project" });
  }
  const id = newId();
  // Evidence is what makes a warranty "recorded": without a document it stays unverified. Nothing is inferred or generated.
  db.prepare(
    "INSERT INTO warranty_records (id, asset_id, provider, terms, start_date, end_date, document_id, verification_state) VALUES (?,?,?,?,?,?,?,?)",
  ).run(id, assetId, v.provider, v.terms ?? null, v.startDate ?? null, v.endDate ?? null, v.documentId ?? null, v.documentId ? "evidence_recorded" : "unverified");
  return id;
}

const ticketSchema = z.object({
  description: reqText("Describe the issue", 3000),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  assetId: z.preprocess(emptyToUndef, z.string().optional()),
});

export function createServiceTicket(db: Db, actor: SessionUser | null, projectId: string, raw: unknown): string {
  if (!actor) throw new DomainError("Нэвтэрнэ үү.", "forbidden");
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
  if (!project) throw new DomainError("Төсөл олдсонгүй.", "not_found");
  if (!isStaff(actor) && !canApproveAsCustomer(actor, project.org_id)) throw new DomainError("Төсөл олдсонгүй.", "not_found");
  const v = parseInput(ticketSchema, raw);
  if (v.assetId && !db.prepare("SELECT 1 FROM installed_assets WHERE id = ? AND project_id = ?").get(v.assetId, projectId)) throw new DomainError("Asset not found on this project.", "invalid");
  const id = newId();
  db.transaction(() => {
    db.prepare("INSERT INTO service_tickets (id, site_id, project_id, asset_id, description, priority, created_by) VALUES (?,?,?,?,?,?,?)")
      .run(id, project.site_id, projectId, v.assetId ?? null, v.description, isStaff(actor) ? v.priority : "normal", actor.id);
    addEvent(db, { projectId, type: "NOTE", actor, note: `Service request opened: ${v.description.slice(0, 160)}`, customerVisible: !isStaff(actor), noteCustomerVisible: !isStaff(actor) });
  })();
  return id;
}

export function updateServiceTicket(db: Db, actor: SessionUser | null, id: string, input: { status?: TicketRow["status"]; priority?: TicketRow["priority"]; assignedTo?: string | null }): void {
  requireStaffActor(actor);
  const t = db.prepare("SELECT * FROM service_tickets WHERE id = ?").get(id) as TicketRow | undefined;
  if (!t) throw new DomainError("Ticket not found.", "not_found");
  const status = input.status ?? t.status;
  const priority = input.priority ?? t.priority;
  if (!["open", "in_progress", "resolved", "closed"].includes(status) || !["low", "normal", "high", "urgent"].includes(priority)) throw new DomainError("Invalid ticket values.");
  const assigned = input.assignedTo === undefined ? t.assigned_to : input.assignedTo;
  if (assigned && !db.prepare("SELECT 1 FROM users WHERE id = ? AND role IN ('staff','admin') AND status = 'active'").get(assigned)) throw new DomainError("Owner must be an active staff member.");
  db.prepare("UPDATE service_tickets SET status = ?, priority = ?, assigned_to = ?, updated_at = ? WHERE id = ?").run(status, priority, assigned, nowIso(), id);
}
