import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney, sumMinor } from "@/lib/domain/money";
import { approvalBlocker, computeQuoteTotals, isConfirmedOffer, lineTotal, quoteFreshness } from "@/lib/domain/quote";

describe("money", () => {
  it("parses MNT as whole units and USD with cents, tolerating separators", () => {
    expect(parseMoney("1 250 000", "MNT")).toBe(1250000);
    expect(parseMoney("1,250,000", "MNT")).toBe(1250000);
    expect(parseMoney("125.50", "USD")).toBe(12550);
    expect(parseMoney("125.5", "USD")).toBe(12550);
    expect(parseMoney("0.1", "USD")).toBe(10);
  });
  it("rejects values that would lose precision or are malformed", () => {
    expect(parseMoney("100.5", "MNT")).toBeNull();
    expect(parseMoney("1.005", "USD")).toBeNull();
    expect(parseMoney("abc", "MNT")).toBeNull();
    expect(parseMoney("-5", "MNT")).toBeNull();
    expect(parseMoney("", "MNT")).toBeNull();
  });
  it("accepts trailing zeros beyond the exponent", () => {
    expect(parseMoney("100.000", "MNT")).toBe(100);
  });
  it("sums integers exactly (no float drift) and rejects fractions", () => {
    expect(sumMinor([10, 20, 30])).toBe(60);
    expect(() => sumMinor([0.5])).toThrow();
  });
  it("formats with the explicit currency code", () => {
    expect(formatMoney(12550, "USD")).toContain("USD");
    expect(formatMoney(1250000, "MNT")).toContain("MNT");
  });
});

describe("quote totals", () => {
  const lines = [{ quantity: 10, unitPriceMinor: 420000 }, { quantity: 1, unitPriceMinor: 4200000 }];
  it("computes line totals and the grand total from integer minor units", () => {
    expect(lineTotal(lines[0])).toBe(4200000);
    const t = computeQuoteTotals(lines, { installationMinor: 2500000, deliveryMinor: 600000, taxesMinor: 0, otherChargesMinor: 100 });
    expect(t.equipmentSubtotalMinor).toBe(8400000);
    expect(t.totalMinor).toBe(8400000 + 2500000 + 600000 + 100);
  });
  it("does not accumulate floating-point error across many lines", () => {
    const many = Array.from({ length: 1000 }, () => ({ quantity: 3, unitPriceMinor: 33 }));
    expect(computeQuoteTotals(many, { installationMinor: 0, deliveryMinor: 0, taxesMinor: 0, otherChargesMinor: 0 }).totalMinor).toBe(99000);
  });
  it("rejects invalid quantities and prices", () => {
    expect(() => lineTotal({ quantity: 0, unitPriceMinor: 1 })).toThrow();
    expect(() => lineTotal({ quantity: 1.5, unitPriceMinor: 1 })).toThrow();
    expect(() => lineTotal({ quantity: 1, unitPriceMinor: -1 })).toThrow();
  });
});

describe("quotation freshness and approval", () => {
  const today = new Date("2026-10-27T10:00:00Z");
  it("treats a quotation past valid-until as expired, never as a current offer", () => {
    expect(quoteFreshness("2026-10-26", today)).toBe("expired");
    expect(quoteFreshness("2026-10-27", today)).toBe("current");
    expect(quoteFreshness(null, today)).toBe("no_validity_date");
  });
  it("confirmed offer = received, dated, unexpired supplier quotation only", () => {
    expect(isConfirmedOffer({ sourceType: "supplier_quotation", status: "received", validUntil: "2026-11-30" }, today)).toBe(true);
    expect(isConfirmedOffer({ sourceType: "supplier_quotation", status: "received", validUntil: "2026-09-30" }, today)).toBe(false);
    expect(isConfirmedOffer({ sourceType: "supplier_quotation", status: "draft", validUntil: "2026-11-30" }, today)).toBe(false);
    expect(isConfirmedOffer({ sourceType: "indicative", status: "received", validUntil: "2026-11-30" }, today)).toBe(false);
    expect(isConfirmedOffer({ sourceType: "demo", status: "received", validUntil: "2026-11-30" }, today)).toBe(false);
  });
  it("blocks approval of expired, undated, withdrawn, draft, indicative and (outside demo projects) demo quotes", () => {
    const q = (o: object) => ({ sourceType: "supplier_quotation" as const, status: "received", validUntil: "2026-11-30", ...o });
    expect(approvalBlocker(q({}), false, today)).toBeNull();
    expect(approvalBlocker(q({ validUntil: "2026-10-01" }), false, today)).toBe("expired");
    expect(approvalBlocker(q({ validUntil: null }), false, today)).toBe("no_validity_date");
    expect(approvalBlocker(q({ status: "withdrawn" }), false, today)).toBe("withdrawn");
    expect(approvalBlocker(q({ status: "draft" }), false, today)).toBe("not_received");
    expect(approvalBlocker(q({ sourceType: "indicative" }), false, today)).toBe("not_a_supplier_quotation");
    expect(approvalBlocker(q({ sourceType: "demo" }), false, today)).toBe("not_a_supplier_quotation");
    expect(approvalBlocker(q({ sourceType: "demo" }), true, today)).toBeNull();
  });
});
