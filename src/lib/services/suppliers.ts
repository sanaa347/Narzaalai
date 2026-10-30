import { z } from "zod";
import type { Db } from "@/lib/db";
import { newId, nowIso } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { DomainError } from "@/lib/domain/errors";
import type { SupplierRow } from "@/lib/db/types";
import { optText, parseInput, reqText } from "@/lib/validation/common";
import { requireStaffActor } from "./actors";

const supplierSchema = z
  .object({
    companyName: reqText("Company name is required", 200),
    contactName: optText(200),
    phone: optText(50),
    email: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().toLowerCase().email("Invalid email").max(200).optional()),
    serviceArea: optText(500),
    offerings: optText(2000),
    supportedBrands: optText(1000),
    installerCapability: z.enum(["none", "claimed", "verified"], { error: "Choose installer capability" }).default("none"),
    qualificationEvidence: optText(2000),
    warrantyTerms: optText(2000),
    status: z.enum(["active", "inactive"]).default("active"),
    internalNotes: optText(4000),
  })
  .superRefine((v, ctx) => {
    if (v.installerCapability === "verified" && !v.qualificationEvidence) {
      ctx.addIssue({
        code: "custom", path: ["qualificationEvidence"],
        message: "A supplier can only be marked as a verified installer when qualification/certification evidence is recorded (what, issued by whom, reference).",
      });
    }
  });
export type SupplierInput = z.output<typeof supplierSchema>;

export function createSupplier(db: Db, actor: SessionUser | null, raw: unknown): string {
  requireStaffActor(actor);
  const v = parseInput(supplierSchema, raw);
  const dupe = db.prepare("SELECT 1 FROM suppliers WHERE lower(company_name) = lower(?) AND archived_at IS NULL").get(v.companyName);
  if (dupe) throw new DomainError("A supplier with this name already exists.", "conflict", { companyName: "A supplier with this name already exists" });
  const id = newId();
  db.prepare(
    `INSERT INTO suppliers (id, company_name, contact_name, phone, email, service_area, offerings, supported_brands, installer_capability,
      qualification_evidence, warranty_terms, status, verification_state, internal_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id, v.companyName, v.contactName ?? null, v.phone ?? null, v.email ?? null, v.serviceArea ?? null, v.offerings ?? null,
    v.supportedBrands ?? null, v.installerCapability, v.qualificationEvidence ?? null, v.warrantyTerms ?? null, v.status,
    v.qualificationEvidence ? "evidence_recorded" : "unverified", v.internalNotes ?? null,
  );
  return id;
}

export function updateSupplier(db: Db, actor: SessionUser | null, id: string, raw: unknown): void {
  requireStaffActor(actor);
  const v = parseInput(supplierSchema, raw);
  const existing = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id) as SupplierRow | undefined;
  if (!existing) throw new DomainError("Supplier not found.", "not_found");
  db.prepare(
    `UPDATE suppliers SET company_name=?, contact_name=?, phone=?, email=?, service_area=?, offerings=?, supported_brands=?, installer_capability=?,
      qualification_evidence=?, warranty_terms=?, status=?, verification_state=?, internal_notes=?, updated_at=? WHERE id=?`,
  ).run(
    v.companyName, v.contactName ?? null, v.phone ?? null, v.email ?? null, v.serviceArea ?? null, v.offerings ?? null,
    v.supportedBrands ?? null, v.installerCapability, v.qualificationEvidence ?? null, v.warrantyTerms ?? null, v.status,
    v.qualificationEvidence ? "evidence_recorded" : "unverified", v.internalNotes ?? null, nowIso(), id,
  );
}

/** Soft delete: the supplier and its quotations stay on record. */
export function setSupplierArchived(db: Db, actor: SessionUser | null, id: string, archived: boolean): void {
  requireStaffActor(actor);
  const r = db
    .prepare("UPDATE suppliers SET archived_at = ?, status = CASE WHEN ? THEN 'inactive' ELSE status END, updated_at = ? WHERE id = ?")
    .run(archived ? nowIso() : null, archived ? 1 : 0, nowIso(), id);
  if (r.changes === 0) throw new DomainError("Supplier not found.", "not_found");
}

export function listSuppliers(db: Db, actor: SessionUser | null, opts: { q?: string; includeArchived?: boolean } = {}) {
  requireStaffActor(actor); // supplier notes, qualifications and warranty terms are internal
  const where: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeArchived) where.push("s.archived_at IS NULL");
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim().replace(/[%_]/g, (m) => "\\" + m)}%`;
    where.push("(s.company_name LIKE ? ESCAPE '\\' OR s.service_area LIKE ? ESCAPE '\\' OR s.supported_brands LIKE ? ESCAPE '\\' OR s.offerings LIKE ? ESCAPE '\\')");
    params.push(like, like, like, like);
  }
  return db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM quotes q WHERE q.supplier_id = s.id AND q.archived_at IS NULL) AS quote_count,
        (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.archived_at IS NULL) AS product_count
       FROM suppliers s ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.company_name`,
    )
    .all(...params) as (SupplierRow & { quote_count: number; product_count: number })[];
}

export function getSupplier(db: Db, actor: SessionUser | null, id: string): SupplierRow | null {
  requireStaffActor(actor);
  return (db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id) as SupplierRow | undefined) ?? null;
}
