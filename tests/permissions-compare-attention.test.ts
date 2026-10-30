import { describe, expect, it } from "vitest";
import { canAccessOperations, canApproveAsCustomer, canManageUsers, canViewDocument, canViewOrgData, canViewQuote, type Actor } from "@/lib/auth/permissions";
import { buildComparison, offerState, type CompareInput } from "@/lib/domain/compare";
import { attentionFlags } from "@/lib/domain/attention";
import { loginBlocked, recordLoginFailure, clearLoginFailures } from "@/lib/auth/ratelimit";

const actor = (o: Partial<Actor>): Actor => ({ id: "u1", role: "customer", status: "active", supplierId: null, orgIds: ["orgA"], ...o });

describe("permissions", () => {
  it("customers see only their own organizations; staff see all; anonymous and disabled see nothing", () => {
    expect(canViewOrgData(actor({}), "orgA")).toBe(true);
    expect(canViewOrgData(actor({}), "orgB")).toBe(false);
    expect(canViewOrgData(actor({ role: "staff", orgIds: [] }), "orgB")).toBe(true);
    expect(canViewOrgData(actor({ status: "disabled" }), "orgA")).toBe(false);
    expect(canViewOrgData(actor({ role: "staff", status: "disabled" }), "orgA")).toBe(false);
    expect(canViewOrgData(null, "orgA")).toBe(false);
  });
  it("only active staff/admin access operations; only admin manages users", () => {
    expect(canAccessOperations(actor({ role: "customer" }))).toBe(false);
    expect(canAccessOperations(actor({ role: "supplier", supplierId: "s1" }))).toBe(false);
    expect(canAccessOperations(actor({ role: "staff" }))).toBe(true);
    expect(canAccessOperations(actor({ role: "staff", status: "disabled" }))).toBe(false);
    expect(canManageUsers(actor({ role: "staff" }))).toBe(false);
    expect(canManageUsers(actor({ role: "admin" }))).toBe(true);
  });
  it("suppliers see only their own quotations; customers never see raw quotations", () => {
    expect(canViewQuote(actor({ role: "supplier", supplierId: "s1" }), { supplierId: "s1" })).toBe(true);
    expect(canViewQuote(actor({ role: "supplier", supplierId: "s1" }), { supplierId: "s2" })).toBe(false);
    expect(canViewQuote(actor({ role: "customer" }), { supplierId: "s1" })).toBe(false);
  });
  it("documents: customers need customer_visible access in their own org; suppliers only their own non-project docs", () => {
    const doc = { orgId: "orgA", supplierId: null, access: "customer_visible" as const };
    expect(canViewDocument(actor({}), doc)).toBe(true);
    expect(canViewDocument(actor({}), { ...doc, access: "staff_only" })).toBe(false);
    expect(canViewDocument(actor({}), { ...doc, orgId: "orgB" })).toBe(false);
    expect(canViewDocument(actor({ role: "supplier", supplierId: "s1" }), { orgId: null, supplierId: "s1", access: "staff_only" })).toBe(true);
    expect(canViewDocument(actor({ role: "supplier", supplierId: "s1" }), { orgId: "orgA", supplierId: "s1", access: "customer_visible" })).toBe(false);
    expect(canViewDocument(null, doc)).toBe(false);
  });
  it("only a customer of the project's organization may approve as customer", () => {
    expect(canApproveAsCustomer(actor({}), "orgA")).toBe(true);
    expect(canApproveAsCustomer(actor({}), "orgB")).toBe(false);
    expect(canApproveAsCustomer(actor({ role: "staff" }), "orgA")).toBe(false);
  });
});

const today = new Date("2026-10-27T00:00:00Z");
const cq = (o: Partial<CompareInput> = {}): CompareInput => ({
  id: "q1", reference: "R1", supplierName: "S", supplierIsDemo: false, sourceType: "supplier_quotation", status: "received", quoteDate: "2026-10-20",
  validUntil: "2026-11-30", currency: "MNT", totalMinor: 1000, equipmentSubtotalMinor: 800, installationMinor: 100, deliveryMinor: 50, taxesMinor: 50,
  otherChargesMinor: 0, pvKwp: 5, batteryKwh: null, inverterKw: 5, stockStatus: "in_stock", leadTimeDays: 14, installationAvailability: "next month",
  warrantyTerms: "10y", exclusions: "none", lines: [], ...o,
});

describe("quotation comparison", () => {
  it("classifies offers: confirmed vs expired vs indicative vs demo vs withdrawn", () => {
    expect(offerState(cq(), today)).toBe("confirmed_offer");
    expect(offerState(cq({ validUntil: "2026-10-01" }), today)).toBe("expired");
    expect(offerState(cq({ validUntil: null }), today)).toBe("no_validity_date");
    expect(offerState(cq({ sourceType: "indicative" }), today)).toBe("indicative");
    expect(offerState(cq({ sourceType: "demo" }), today)).toBe("demo");
    expect(offerState(cq({ status: "withdrawn" }), today)).toBe("withdrawn");
  });
  it("highlights the lowest total only among confirmed offers in one currency, and never produces a ranking score", () => {
    const c = buildComparison([cq({ id: "a", totalMinor: 900 }), cq({ id: "b", totalMinor: 700 }), cq({ id: "c", totalMinor: 100, sourceType: "indicative" })], today);
    expect(c.columns.find((x) => x.lowestConfirmedTotal)?.input.id).toBe("b");
    expect(c.columns.find((x) => x.input.id === "c")?.lowestConfirmedTotal).toBe(false);
    expect(JSON.stringify(c)).not.toMatch(/rank|score/i);
    expect(c.notes).toContain("price_not_only_criterion");
    expect(c.notes).toContain("not_all_confirmed");
  });
  it("does not compare totals across currencies", () => {
    const c = buildComparison([cq({ id: "a" }), cq({ id: "b", currency: "USD", totalMinor: 5 })], today);
    expect(c.mixedCurrency).toBe(true);
    expect(c.columns.every((x) => !x.lowestConfirmedTotal)).toBe(true);
    expect(c.notes).toContain("mixed_currency");
  });
  it("lists unknown attributes instead of treating them as zero", () => {
    const col = buildComparison([cq({ pvKwp: null, leadTimeDays: null, warrantyTerms: null, stockStatus: "unknown" })], today).columns[0];
    expect(col.unknownFields).toEqual(expect.arrayContaining(["pvKwp", "leadTimeDays", "warrantyTerms", "stockStatus"]));
    expect(col.costPerKwpMinor).toBeNull();
  });
  it("computes cost per kWp only when capacity is known", () => {
    expect(buildComparison([cq({ totalMinor: 1000, pvKwp: 5 })], today).columns[0].costPerKwpMinor).toBe(200);
  });
});

describe("attention flags", () => {
  const base = { status: "ASSESSMENT" as const, nextActionDue: null, blockedReason: null, assignedTo: "u", openInfoRequests: 0, hasCommissioningEvidence: false };
  it("flags overdue only on active projects", () => {
    expect(attentionFlags({ ...base, nextActionDue: "2026-10-01" }, today)).toContain("overdue");
    expect(attentionFlags({ ...base, nextActionDue: "2026-11-01" }, today)).not.toContain("overdue");
    expect(attentionFlags({ ...base, status: "CANCELLED", nextActionDue: "2026-10-01" }, today)).not.toContain("overdue");
  });
  it("flags blocked, delayed, unassigned, open info requests and missing commissioning evidence", () => {
    expect(attentionFlags({ ...base, blockedReason: "Waiting for customs" }, today)).toContain("blocked");
    expect(attentionFlags({ ...base, status: "DELAYED" }, today)).toContain("delayed");
    expect(attentionFlags({ ...base, assignedTo: null }, today)).toContain("unassigned");
    expect(attentionFlags({ ...base, openInfoRequests: 2 }, today)).toContain("open_info_request");
    expect(attentionFlags({ ...base, status: "COMMISSIONING" }, today)).toContain("missing_commissioning_evidence");
    expect(attentionFlags({ ...base, status: "COMMISSIONING", hasCommissioningEvidence: true }, today)).not.toContain("missing_commissioning_evidence");
  });
});

describe("login throttle", () => {
  it("blocks after repeated failures and resets on success", () => {
    const key = "throttle@test";
    for (let i = 0; i < 8; i++) recordLoginFailure(key);
    expect(loginBlocked(key)).toBe(true);
    clearLoginFailures(key);
    expect(loginBlocked(key)).toBe(false);
  });
  it("forgets failures after the window", () => {
    const key = "old@test";
    for (let i = 0; i < 8; i++) recordLoginFailure(key, Date.now() - 16 * 60_000);
    expect(loginBlocked(key)).toBe(false);
  });
});
