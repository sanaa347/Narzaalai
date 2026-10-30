import { describe, expect, it } from "vitest";
import { endOfLocalDay, localDate, localDatePlusDays, startOfLocalDay } from "@/lib/domain/dates";
import { attentionFlags } from "@/lib/domain/attention";
import { approvalBlocker, isConfirmedOffer, quoteFreshness } from "@/lib/domain/quote";
import { offerState } from "@/lib/domain/compare";

/** Mongolia (Ulaanbaatar) is UTC+8 with no daylight saving. "Valid until 28 Oct" means until the end of 28 Oct THERE. */
describe("business calendar (Asia/Ulaanbaatar)", () => {
  it("localDate gives the Ulaanbaatar calendar day, not the UTC day", () => {
    expect(localDate(new Date("2026-10-28T15:59:59Z"))).toBe("2026-10-28");
    expect(localDate(new Date("2026-10-28T16:00:00Z"))).toBe("2026-10-29"); // 00:00 local
    expect(localDate(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
  });

  it("endOfLocalDay is 23:59:59.999 local = 15:59:59.999 UTC", () => {
    expect(endOfLocalDay("2026-10-28").toISOString()).toBe("2026-10-28T15:59:59.999Z");
  });

  it("regression: a quotation valid until 28 Oct is expired from 00:00 on 29 Oct Ulaanbaatar time (it used to stay 'current' until 08:00)", () => {
    expect(quoteFreshness("2026-10-28", new Date("2026-10-28T15:59:00Z"))).toBe("current");
    expect(quoteFreshness("2026-10-28", new Date("2026-10-28T16:00:00Z"))).toBe("expired");
    expect(quoteFreshness("2026-10-28", new Date("2026-10-28T20:00:00Z"))).toBe("expired"); // 04:00 on the 29th locally
  });

  it("an expired quotation is not a confirmed offer, cannot be approved, and is labelled expired in comparisons", () => {
    const night = new Date("2026-10-28T20:00:00Z");
    const q = { sourceType: "supplier_quotation" as const, status: "received", validUntil: "2026-10-28" };
    expect(isConfirmedOffer(q, night)).toBe(false);
    expect(approvalBlocker(q, false, night)).toBe("expired");
    expect(offerState(q, night)).toBe("expired");
  });

  it("startOfLocalDay and localDatePlusDays are consistent with the Ulaanbaatar day", () => {
    expect(startOfLocalDay("2026-10-29").toISOString()).toBe("2026-10-28T16:00:00.000Z");
    expect(localDatePlusDays(2, new Date("2026-10-28T20:00:00Z"))).toBe("2026-10-31"); // local day is the 29th
    expect(localDatePlusDays(1, new Date("2026-12-31T05:00:00Z"))).toBe("2027-01-01");
  });

  it("a next-action due on the 28th becomes overdue at 00:00 on the 29th local time, not at 08:00", () => {
    const base = { status: "ASSESSMENT" as const, nextActionDue: "2026-10-28", blockedReason: null, assignedTo: "u", openInfoRequests: 0, hasCommissioningEvidence: false };
    expect(attentionFlags(base, new Date("2026-10-28T15:00:00Z"))).not.toContain("overdue");
    expect(attentionFlags(base, new Date("2026-10-28T16:30:00Z"))).toContain("overdue");
  });
});
