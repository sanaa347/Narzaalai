import { z } from "zod";
import type { Db } from "@/lib/db";
import { newId, nowIso } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { DomainError } from "@/lib/domain/errors";
import { CURRENCIES, parseMoney, type Currency } from "@/lib/domain/money";
import { computeQuoteTotals } from "@/lib/domain/quote";
import { offerState, type CompareInput, type OfferState } from "@/lib/domain/compare";
import type { QuoteLineRow, QuoteRow, SupplierRow } from "@/lib/db/types";
import { emptyToUndef, isoDate, optIsoDate, optNum, optText, parseInput, reqText } from "@/lib/validation/common";
import { requireStaffActor } from "./actors";
import { PRODUCT_CATEGORIES } from "./products";

const jsonIfString = (v: unknown) => {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
};

const lineSchema = z.object({
  category: z.enum(PRODUCT_CATEGORIES).default("other"),
  productId: z.preprocess(emptyToUndef, z.string().optional()),
  description: reqText("Description is required", 300),
  manufacturer: optText(200),
  model: optText(200),
  quantity: z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/\s/g, "")) : v), z.number({ error: "Quantity must be a number" }).int("Whole units only").positive("Quantity must be at least 1").max(1_000_000)),
  unitPrice: z.string({ error: "Unit price is required" }).trim().min(1, "Unit price is required"),
  notes: optText(500),
});

const money = z.preprocess(emptyToUndef, z.string().trim().max(40).optional());

const quoteSchema = z
  .object({
    supplierId: reqText("Choose a supplier", 100),
    projectId: z.preprocess(emptyToUndef, z.string().optional()),
    reference: reqText("Quotation reference is required", 100),
    quoteDate: isoDate("Quotation date is required (YYYY-MM-DD)"),
    receivedOn: optIsoDate("Use YYYY-MM-DD"),
    validUntil: optIsoDate("Use YYYY-MM-DD"),
    currency: z.enum(CURRENCIES, { error: "Choose a currency" }),
    lines: z.preprocess(jsonIfString, z.array(lineSchema).min(1, "Add at least one equipment line").max(60)),
    installation: money,
    delivery: money,
    taxes: money,
    otherCharges: money,
    exclusions: optText(2000),
    stockStatus: z.enum(["in_stock", "partial", "on_order", "unknown"]).default("unknown"),
    leadTimeDays: optNum(0, 3650, "Lead time must be 0–3650 days"),
    installationAvailability: optText(500),
    deliveryAssumptions: optText(1000),
    warrantyTerms: optText(2000),
    pvKwp: optNum(0.01, 100000, "PV capacity must be a positive number (kWp)"),
    batteryKwh: optNum(0, 1000000, "Battery capacity must be ≥ 0 (kWh)"),
    inverterKw: optNum(0.01, 100000, "Inverter size must be a positive number (kW)"),
    sourceType: z.enum(["supplier_quotation", "indicative", "demo"], { error: "Choose the source type" }),
    sourceNote: optText(1000),
    status: z.enum(["draft", "received"]).default("received"),
  })
  .superRefine((v, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    for (const key of ["installation", "delivery", "taxes", "otherCharges"] as const) {
      const val = v[key];
      if (val !== undefined && parseMoney(val, v.currency) === null) issue([key], `Invalid amount in ${v.currency}`);
    }
    v.lines.forEach((l, i) => {
      if (parseMoney(l.unitPrice, v.currency) === null) issue(["lines", i, "unitPrice"], `Invalid unit price in ${v.currency}`);
    });
    if (v.validUntil && v.validUntil < v.quoteDate) issue(["validUntil"], "Valid-until cannot be before the quotation date");
    if (v.sourceType === "supplier_quotation") {
      if (!v.receivedOn) issue(["receivedOn"], "Record the date this quotation was received from the supplier");
      if (!v.sourceNote) issue(["sourceNote"], "Record how it was received (e.g. email from contact, date, attachment name)");
    }
  });

type QuoteInput = z.output<typeof quoteSchema>;

function buildRecord(db: Db, v: QuoteInput) {
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(v.supplierId) as SupplierRow | undefined;
  if (!supplier || supplier.archived_at) throw new DomainError("Supplier not found or archived.", "invalid", { supplierId: "Choose an active supplier" });
  // Integrity: fictional (demo) businesses cannot issue "real" quotations, and real suppliers cannot carry demo prices.
  if (supplier.is_demo === 1 && v.sourceType === "supplier_quotation") {
    throw new DomainError("A demo supplier cannot provide a real supplier quotation. Use source type 'demo'.", "invalid", { sourceType: "Demo suppliers can only carry demo prices" });
  }
  if (supplier.is_demo === 0 && v.sourceType === "demo") {
    throw new DomainError("Demo prices can only be attached to demo suppliers.", "invalid", { sourceType: "Demo source requires a demo supplier" });
  }
  if (v.projectId) {
    const p = db.prepare("SELECT status FROM projects WHERE id = ?").get(v.projectId) as { status: string } | undefined;
    if (!p) throw new DomainError("Project not found.", "invalid", { projectId: "Project not found" });
    if (["CANCELLED", "REJECTED"].includes(p.status)) throw new DomainError("This project is closed.", "workflow", { projectId: "Project is closed" });
  }
  const cur = v.currency as Currency;
  const m = (s: string | undefined) => (s === undefined ? 0 : (parseMoney(s, cur) as number));
  const lines = v.lines.map((l, i) => {
    const unit = parseMoney(l.unitPrice, cur) as number;
    return { ...l, unitMinor: unit, totalMinor: l.quantity * unit, position: i };
  });
  const charges = { installationMinor: m(v.installation), deliveryMinor: m(v.delivery), taxesMinor: m(v.taxes), otherChargesMinor: m(v.otherCharges) };
  const totals = computeQuoteTotals(lines.map((l) => ({ quantity: l.quantity, unitPriceMinor: l.unitMinor })), charges);
  return { supplier, lines, charges, totals };
}

function insertLines(db: Db, quoteId: string, currency: Currency, lines: ReturnType<typeof buildRecord>["lines"]) {
  const stmt = db.prepare(
    `INSERT INTO quote_line_items (id, quote_id, product_id, category, description, manufacturer, model, quantity, unit_price_minor, currency, line_total_minor, notes, position)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const l of lines) {
    stmt.run(newId(), quoteId, l.productId ?? null, l.category, l.description, l.manufacturer ?? null, l.model ?? null, l.quantity, l.unitMinor, currency, l.totalMinor, l.notes ?? null, l.position);
  }
}

const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE";

export function createQuote(db: Db, actor: SessionUser | null, raw: unknown): string {
  const staff = requireStaffActor(actor);
  const v = parseInput(quoteSchema, raw);
  const rec = buildRecord(db, v);
  const id = newId();
  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO quotes (id, supplier_id, project_id, reference, quote_date, received_on, valid_until, currency, equipment_subtotal_minor,
          installation_minor, delivery_minor, taxes_minor, other_charges_minor, total_minor, exclusions, stock_status, lead_time_days,
          installation_availability, delivery_assumptions, warranty_terms, pv_kwp, battery_kwh, inverter_kw, source_type, source_note, status, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id, v.supplierId, v.projectId ?? null, v.reference, v.quoteDate, v.receivedOn ?? null, v.validUntil ?? null, v.currency,
        rec.totals.equipmentSubtotalMinor, rec.charges.installationMinor, rec.charges.deliveryMinor, rec.charges.taxesMinor,
        rec.charges.otherChargesMinor, rec.totals.totalMinor, v.exclusions ?? null, v.stockStatus, v.leadTimeDays ?? null,
        v.installationAvailability ?? null, v.deliveryAssumptions ?? null, v.warrantyTerms ?? null, v.pvKwp ?? null, v.batteryKwh ?? null, v.inverterKw ?? null,
        v.sourceType, v.sourceNote ?? null, v.status, staff.id,
      );
      insertLines(db, id, v.currency, rec.lines);
    })();
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("This supplier already has a quotation with that reference.", "conflict", { reference: "Reference already used for this supplier" });
    throw e;
  }
  return id;
}

export function updateQuote(db: Db, actor: SessionUser | null, id: string, raw: unknown): void {
  requireStaffActor(actor);
  const existing = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as QuoteRow | undefined;
  if (!existing) throw new DomainError("Quotation not found.", "not_found");
  const locked = db
    .prepare("SELECT 1 FROM proposal_options o JOIN proposals p ON p.id = o.proposal_id WHERE o.quote_id = ? AND p.status IN ('published','approved')")
    .get(id);
  if (locked) throw new DomainError("This quotation is part of a published proposal and can no longer be edited. Withdraw the proposal first, or record a new quotation.", "workflow");
  const v = parseInput(quoteSchema, raw);
  const rec = buildRecord(db, v);
  try {
    db.transaction(() => {
      // Old lines go first so the quote's currency can change without ever coexisting with lines priced in the old
      // currency (migration 004 forbids that state at the database level).
      db.prepare("DELETE FROM quote_line_items WHERE quote_id = ?").run(id);
      db.prepare(
        `UPDATE quotes SET supplier_id=?, project_id=?, reference=?, quote_date=?, received_on=?, valid_until=?, currency=?, equipment_subtotal_minor=?,
          installation_minor=?, delivery_minor=?, taxes_minor=?, other_charges_minor=?, total_minor=?, exclusions=?, stock_status=?, lead_time_days=?,
          installation_availability=?, delivery_assumptions=?, warranty_terms=?, pv_kwp=?, battery_kwh=?, inverter_kw=?, source_type=?, source_note=?, status=?, updated_at=? WHERE id=?`,
      ).run(
        v.supplierId, v.projectId ?? null, v.reference, v.quoteDate, v.receivedOn ?? null, v.validUntil ?? null, v.currency,
        rec.totals.equipmentSubtotalMinor, rec.charges.installationMinor, rec.charges.deliveryMinor, rec.charges.taxesMinor,
        rec.charges.otherChargesMinor, rec.totals.totalMinor, v.exclusions ?? null, v.stockStatus, v.leadTimeDays ?? null,
        v.installationAvailability ?? null, v.deliveryAssumptions ?? null, v.warrantyTerms ?? null, v.pvKwp ?? null, v.batteryKwh ?? null, v.inverterKw ?? null,
        v.sourceType, v.sourceNote ?? null, v.status, nowIso(), id,
      );
      insertLines(db, id, v.currency, rec.lines);
    })();
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("This supplier already has a quotation with that reference.", "conflict", { reference: "Reference already used for this supplier" });
    throw e;
  }
}

export function setQuoteStatus(db: Db, actor: SessionUser | null, id: string, status: "draft" | "received" | "withdrawn"): void {
  requireStaffActor(actor);
  const r = db.prepare("UPDATE quotes SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
  if (r.changes === 0) throw new DomainError("Quotation not found.", "not_found");
}

export function setQuoteArchived(db: Db, actor: SessionUser | null, id: string, archived: boolean): void {
  requireStaffActor(actor);
  if (archived) {
    const inUse = db.prepare("SELECT 1 FROM proposal_options o JOIN proposals p ON p.id = o.proposal_id WHERE o.quote_id = ? AND p.status IN ('published','approved')").get(id);
    if (inUse) throw new DomainError("This quotation is part of a published proposal; withdraw the proposal before archiving it.", "workflow");
  }
  const r = db.prepare("UPDATE quotes SET archived_at = ?, updated_at = ? WHERE id = ?").run(archived ? nowIso() : null, nowIso(), id);
  if (r.changes === 0) throw new DomainError("Quotation not found.", "not_found");
}

export interface QuoteListRow extends QuoteRow {
  supplier_name: string;
  supplier_is_demo: number;
  project_reference: string | null;
  offer: OfferState;
}

export function listQuotes(db: Db, actor: SessionUser | null, opts: { q?: string; projectId?: string; supplierId?: string; includeArchived?: boolean } = {}, today = new Date()): QuoteListRow[] {
  requireStaffActor(actor); // raw quotations (prices, exclusions, source notes) are never customer-readable
  const where: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeArchived) where.push("q.archived_at IS NULL");
  if (opts.projectId) { where.push("q.project_id = ?"); params.push(opts.projectId); }
  if (opts.supplierId) { where.push("q.supplier_id = ?"); params.push(opts.supplierId); }
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim().replace(/[%_]/g, (m) => "\\" + m)}%`;
    where.push("(q.reference LIKE ? ESCAPE '\\' OR s.company_name LIKE ? ESCAPE '\\' OR pr.reference LIKE ? ESCAPE '\\')");
    params.push(like, like, like);
  }
  const rows = db
    .prepare(
      `SELECT q.*, s.company_name AS supplier_name, s.is_demo AS supplier_is_demo, pr.reference AS project_reference
       FROM quotes q JOIN suppliers s ON s.id = q.supplier_id LEFT JOIN projects pr ON pr.id = q.project_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY q.quote_date DESC, q.created_at DESC`,
    )
    .all(...params) as Omit<QuoteListRow, "offer">[];
  return rows.map((r) => ({ ...r, offer: offerState({ sourceType: r.source_type, status: r.status, validUntil: r.valid_until }, today) }));
}

export interface QuoteDetail {
  quote: QuoteRow;
  supplier: SupplierRow;
  lines: QuoteLineRow[];
  projectReference: string | null;
  offer: OfferState;
  document: { id: string; original_name: string } | null;
}

export function getQuoteDetail(db: Db, actor: SessionUser | null, id: string, today = new Date()): QuoteDetail | null {
  requireStaffActor(actor);
  return loadQuoteDetail(db, id, today);
}

/** Unguarded loader for internal callers that build an already-authorised view (e.g. a published proposal). */
function loadQuoteDetail(db: Db, id: string, today = new Date()): QuoteDetail | null {
  const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as QuoteRow | undefined;
  if (!quote) return null;
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(quote.supplier_id) as SupplierRow;
  const lines = db.prepare("SELECT * FROM quote_line_items WHERE quote_id = ? ORDER BY position").all(id) as QuoteLineRow[];
  const projectReference = quote.project_id ? ((db.prepare("SELECT reference FROM projects WHERE id = ?").get(quote.project_id) as { reference: string } | undefined)?.reference ?? null) : null;
  const document = quote.document_id ? ((db.prepare("SELECT id, original_name FROM documents WHERE id = ?").get(quote.document_id) as { id: string; original_name: string } | undefined) ?? null) : null;
  return { quote, supplier, lines, projectReference, offer: offerState({ sourceType: quote.source_type, status: quote.status, validUntil: quote.valid_until }, today), document };
}

export function getComparisonInputs(db: Db, ids: readonly string[]): CompareInput[] {
  const out: CompareInput[] = [];
  for (const id of ids) {
    const d = loadQuoteDetail(db, id);
    if (!d) continue;
    const q = d.quote;
    out.push({
      id: q.id, reference: q.reference, supplierName: d.supplier.company_name, supplierIsDemo: d.supplier.is_demo === 1, sourceType: q.source_type,
      status: q.status, quoteDate: q.quote_date, validUntil: q.valid_until, currency: q.currency, totalMinor: q.total_minor,
      equipmentSubtotalMinor: q.equipment_subtotal_minor, installationMinor: q.installation_minor, deliveryMinor: q.delivery_minor,
      taxesMinor: q.taxes_minor, otherChargesMinor: q.other_charges_minor, pvKwp: q.pv_kwp, batteryKwh: q.battery_kwh, inverterKw: q.inverter_kw,
      stockStatus: q.stock_status, leadTimeDays: q.lead_time_days, installationAvailability: q.installation_availability, deliveryAssumptions: q.delivery_assumptions,
      warrantyTerms: q.warranty_terms, exclusions: q.exclusions,
      lines: d.lines.map((l) => ({ category: l.category, manufacturer: l.manufacturer, model: l.model, quantity: l.quantity })),
    });
  }
  return out;
}
