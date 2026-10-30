import { z } from "zod";
import type { Db } from "@/lib/db";
import { newId } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { DomainError } from "@/lib/domain/errors";
import { CURRENCIES, parseMoney, type Currency } from "@/lib/domain/money";
import type { ProductRow } from "@/lib/db/types";
import { isoDate, optText, parseInput, reqText, emptyToUndef } from "@/lib/validation/common";
import { requireStaffActor } from "./actors";

export const PRODUCT_CATEGORIES = ["pv_module", "inverter", "battery", "mounting", "charge_controller", "cabling", "monitoring", "other"] as const;

const productSchema = z
  .object({
    supplierId: z.preprocess(emptyToUndef, z.string().optional()),
    category: z.enum(PRODUCT_CATEGORIES, { error: "Choose a category" }),
    manufacturer: reqText("Manufacturer is required", 200),
    model: reqText("Model is required", 200),
    specs: optText(2000),
    price: optText(40),
    currency: z.enum(CURRENCIES).default("MNT"),
    compatibility: optText(2000),
    verificationState: z.enum(["unverified", "supplier_provided", "independently_verified"]).default("unverified"),
    source: optText(500),
    lastCheckedOn: z.preprocess(emptyToUndef, isoDate("Use YYYY-MM-DD").optional()),
  })
  .superRefine((v, ctx) => {
    if (v.price !== undefined) {
      if (parseMoney(v.price, v.currency) === null) ctx.addIssue({ code: "custom", path: ["price"], message: "Invalid price for this currency" });
      if (!v.source) ctx.addIssue({ code: "custom", path: ["source"], message: "Record where this price came from" });
      if (!v.lastCheckedOn) ctx.addIssue({ code: "custom", path: ["lastCheckedOn"], message: "Record the date the price was checked" });
    }
  });

export function createProduct(db: Db, actor: SessionUser | null, raw: unknown): string {
  requireStaffActor(actor);
  const v = parseInput(productSchema, raw);
  if (v.supplierId && !db.prepare("SELECT 1 FROM suppliers WHERE id = ? AND archived_at IS NULL").get(v.supplierId)) {
    throw new DomainError("Supplier not found.", "invalid", { supplierId: "Supplier not found" });
  }
  const id = newId();
  db.prepare(
    `INSERT INTO products (id, supplier_id, category, manufacturer, model, specs, price_minor, currency, compatibility, verification_state, source, last_checked_on)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id, v.supplierId ?? null, v.category, v.manufacturer, v.model, v.specs ?? null, v.price !== undefined ? parseMoney(v.price, v.currency) : null,
    v.currency, v.compatibility ?? null, v.verificationState, v.source ?? null, v.lastCheckedOn ?? null,
  );
  return id;
}

export function setProductArchived(db: Db, actor: SessionUser | null, id: string, archived: boolean): void {
  requireStaffActor(actor);
  const r = db.prepare("UPDATE products SET archived_at = ?, updated_at = ? WHERE id = ?").run(archived ? new Date().toISOString() : null, new Date().toISOString(), id);
  if (r.changes === 0) throw new DomainError("Product not found.", "not_found");
}

export function listProducts(db: Db, actor: SessionUser | null, opts: { q?: string; category?: string; supplierId?: string; includeArchived?: boolean } = {}) {
  requireStaffActor(actor); // product price information is internal
  const where: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeArchived) where.push("p.archived_at IS NULL");
  if (opts.category && (PRODUCT_CATEGORIES as readonly string[]).includes(opts.category)) { where.push("p.category = ?"); params.push(opts.category); }
  if (opts.supplierId) { where.push("p.supplier_id = ?"); params.push(opts.supplierId); }
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim().replace(/[%_]/g, (m) => "\\" + m)}%`;
    where.push("(p.manufacturer LIKE ? ESCAPE '\\' OR p.model LIKE ? ESCAPE '\\' OR p.specs LIKE ? ESCAPE '\\')");
    params.push(like, like, like);
  }
  return db
    .prepare(`SELECT p.*, s.company_name AS supplier_name FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.category, p.manufacturer, p.model`)
    .all(...params) as (ProductRow & { supplier_name: string | null })[];
}

export type { Currency };
