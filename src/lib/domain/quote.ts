import { sumMinor } from "./money";
import { endOfLocalDay } from "./dates";

export interface LineInput {
  quantity: number;
  unitPriceMinor: number;
}

export interface QuoteCharges {
  installationMinor: number;
  deliveryMinor: number;
  taxesMinor: number;
  otherChargesMinor: number;
}

export function lineTotal(line: LineInput): number {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("Quantity must be a positive integer");
  if (!Number.isInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) throw new Error("Unit price must be a non-negative integer");
  const t = line.quantity * line.unitPriceMinor;
  if (!Number.isSafeInteger(t)) throw new Error("Line total overflow");
  return t;
}

export function computeQuoteTotals(lines: readonly LineInput[], charges: QuoteCharges) {
  const equipmentSubtotalMinor = sumMinor(lines.map(lineTotal));
  const totalMinor = sumMinor([
    equipmentSubtotalMinor,
    charges.installationMinor,
    charges.deliveryMinor,
    charges.taxesMinor,
    charges.otherChargesMinor,
  ]);
  return { equipmentSubtotalMinor, totalMinor };
}

export type SourceType = "supplier_quotation" | "indicative" | "demo";

export type QuoteFreshness = "current" | "expired" | "no_validity_date";

/** A quotation past its valid-until date must never be presented as a current offer. */
export function quoteFreshness(validUntil: string | null, today = new Date()): QuoteFreshness {
  if (!validUntil) return "no_validity_date";
  // "Valid until 28 Oct" runs to the end of 28 Oct in Ulaanbaatar, not in UTC (which would add 8 stale hours).
  return endOfLocalDay(validUntil).getTime() < today.getTime() ? "expired" : "current";
}

/** Only a received, dated, unexpired supplier quotation counts as a confirmed offer. */
export function isConfirmedOffer(q: { sourceType: SourceType; status: string; validUntil: string | null }, today = new Date()): boolean {
  return q.sourceType === "supplier_quotation" && q.status === "received" && quoteFreshness(q.validUntil, today) === "current";
}

/**
 * Why a quotation cannot be approved by a customer right now, or null when it can.
 * Only a current, dated supplier quotation is approvable. Demo prices are approvable only inside demo projects.
 */
export function approvalBlocker(
  q: { sourceType: SourceType; status: string; validUntil: string | null },
  projectIsDemo: boolean,
  today = new Date(),
): string | null {
  if (q.status === "withdrawn") return "withdrawn";
  if (q.status !== "received") return "not_received";
  if (q.sourceType === "supplier_quotation") {
    const f = quoteFreshness(q.validUntil, today);
    if (f === "expired") return "expired";
    if (f === "no_validity_date") return "no_validity_date";
    return null;
  }
  if (q.sourceType === "demo" && projectIsDemo) return null;
  return "not_a_supplier_quotation";
}
