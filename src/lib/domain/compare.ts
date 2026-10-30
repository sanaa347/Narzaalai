import { quoteFreshness, type SourceType } from "./quote";
import type { Currency } from "./money";

/**
 * Quotation comparison. Deliberately NOT a ranking: there is no composite score.
 * Price is shown next to capacity, equipment, scope, warranty, lead time and exclusions so the team judges the whole offer.
 */
export interface CompareLine {
  category: string;
  manufacturer: string | null;
  model: string | null;
  quantity: number;
}

export interface CompareInput {
  id: string;
  reference: string;
  supplierName: string;
  supplierIsDemo: boolean;
  sourceType: SourceType;
  status: string;
  quoteDate: string;
  validUntil: string | null;
  currency: Currency;
  totalMinor: number;
  equipmentSubtotalMinor: number;
  installationMinor: number;
  deliveryMinor: number;
  taxesMinor: number;
  otherChargesMinor: number;
  pvKwp: number | null;
  batteryKwh: number | null;
  inverterKw: number | null;
  stockStatus: "in_stock" | "partial" | "on_order" | "unknown";
  leadTimeDays: number | null;
  installationAvailability: string | null;
  /** What the delivery price / lead time assumes (destination, unloading, incoterm). Optional: older records have none. */
  deliveryAssumptions?: string | null;
  warrantyTerms: string | null;
  exclusions: string | null;
  lines: CompareLine[];
}

export type OfferState = "confirmed_offer" | "expired" | "no_validity_date" | "indicative" | "demo" | "withdrawn";

export function offerState(q: Pick<CompareInput, "sourceType" | "status" | "validUntil">, today = new Date()): OfferState {
  if (q.status === "withdrawn") return "withdrawn";
  if (q.sourceType === "demo") return "demo";
  if (q.sourceType === "indicative") return "indicative";
  const f = quoteFreshness(q.validUntil, today);
  if (f === "expired") return "expired";
  if (f === "no_validity_date") return "no_validity_date";
  return "confirmed_offer";
}

export interface CompareColumn {
  input: CompareInput;
  state: OfferState;
  /** Whole currency units per kWp, only when capacity is known. Informational, never a ranking. */
  costPerKwpMinor: number | null;
  /** True when this column's total is the lowest among confirmed offers sharing one currency. */
  lowestConfirmedTotal: boolean;
  /** Fields the supplier/staff did not provide; shown as "unknown", never as zero. */
  unknownFields: string[];
}

export interface Comparison {
  columns: CompareColumn[];
  mixedCurrency: boolean;
  confirmedCount: number;
  notes: ("mixed_currency" | "not_all_confirmed" | "single_option" | "price_not_only_criterion")[];
}

export function buildComparison(quotes: readonly CompareInput[], today = new Date()): Comparison {
  const states = quotes.map((q) => offerState(q, today));
  const currencies = new Set(quotes.map((q) => q.currency));
  const mixedCurrency = currencies.size > 1;

  const confirmed = quotes.filter((_, i) => states[i] === "confirmed_offer");
  let lowestId: string | null = null;
  if (!mixedCurrency && confirmed.length >= 2) {
    lowestId = confirmed.reduce((a, b) => (b.totalMinor < a.totalMinor ? b : a)).id;
  }

  const columns = quotes.map((q, i): CompareColumn => {
    const unknown: string[] = [];
    if (q.pvKwp == null) unknown.push("pvKwp");
    if (q.batteryKwh == null) unknown.push("batteryKwh");
    if (q.inverterKw == null) unknown.push("inverterKw");
    if (q.leadTimeDays == null) unknown.push("leadTimeDays");
    if (q.stockStatus === "unknown") unknown.push("stockStatus");
    if (!q.installationAvailability) unknown.push("installationAvailability");
    if (!q.warrantyTerms) unknown.push("warrantyTerms");
    if (!q.validUntil) unknown.push("validUntil");
    if (q.exclusions == null) unknown.push("exclusions");
    return {
      input: q,
      state: states[i],
      costPerKwpMinor: q.pvKwp && q.pvKwp > 0 ? Math.round(q.totalMinor / q.pvKwp) : null,
      lowestConfirmedTotal: q.id === lowestId,
      unknownFields: unknown,
    };
  });

  const notes: Comparison["notes"] = ["price_not_only_criterion"];
  if (mixedCurrency) notes.push("mixed_currency");
  if (columns.some((c) => c.state !== "confirmed_offer")) notes.push("not_all_confirmed");
  if (quotes.length < 2) notes.push("single_option");
  return { columns, mixedCurrency, confirmedCount: confirmed.length, notes };
}
