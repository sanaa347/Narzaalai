import { describe, expect, it } from "vitest";
import { assessmentSchema, flattenIssues, validateStep, accountSchema } from "@/lib/validation/assessment";
import { calculatePrelim, CALC_VERSION, type PrelimInput } from "@/lib/solar/prelim";
import { businessPayload, householdPayload } from "./helpers";

describe("assessment validation", () => {
  it("accepts a minimal valid household request", () => {
    expect(assessmentSchema.safeParse(householdPayload()).success).toBe(true);
  });
  it("household does not require business fields", () => {
    const r = assessmentSchema.safeParse(householdPayload());
    expect(r.success).toBe(true);
  });
  it("business requires name, category, operating hours and usage pattern", () => {
    const r = assessmentSchema.safeParse({ ...businessPayload(), businessName: "", businessCategory: "", businessOperatingHours: "", businessUsagePattern: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const f = flattenIssues(r.error);
      expect(Object.keys(f)).toEqual(expect.arrayContaining(["businessName", "businessCategory", "businessOperatingHours", "businessUsagePattern"]));
    }
  });
  it("property type must match the customer type", () => {
    expect(assessmentSchema.safeParse(householdPayload({ propertyType: "shop" })).success).toBe(false);
    expect(assessmentSchema.safeParse(businessPayload({ propertyType: "ger" })).success).toBe(false);
  });
  it("requires usage OR a bill OR an explicit 'I don't know'", () => {
    const none = householdPayload({ monthlyKwh: "" });
    expect(assessmentSchema.safeParse(none).success).toBe(false);
    expect(assessmentSchema.safeParse({ ...none, usageUnknown: true }).success).toBe(true);
    expect(assessmentSchema.safeParse({ ...none, billAmount: "90000", billingPeriod: "2026-09" }).success).toBe(true);
    expect(assessmentSchema.safeParse({ ...none, billAmount: "90000" }).success).toBe(false); // bill needs its period
  });
  it("coordinates are optional but must come as a pair and in range", () => {
    expect(assessmentSchema.safeParse(householdPayload({ latitude: "47.9" })).success).toBe(false);
    expect(assessmentSchema.safeParse(householdPayload({ latitude: "47.9", longitude: "106.9" })).success).toBe(true);
    expect(assessmentSchema.safeParse(householdPayload({ latitude: "147.9", longitude: "106.9" })).success).toBe(false);
  });
  it("budget max cannot be below budget min; objectives and consent are required", () => {
    expect(assessmentSchema.safeParse(householdPayload({ budgetMin: "10", budgetMax: "5" })).success).toBe(false);
    expect(assessmentSchema.safeParse(householdPayload({ objectives: [] })).success).toBe(false);
    expect(assessmentSchema.safeParse(householdPayload({ consent: false })).success).toBe(false);
  });
  it("step validation only reports the fields of that step", () => {
    const empty: Record<string, unknown> = { customerType: "household" };
    expect(Object.keys(validateStep(0, empty))).toEqual([]);
    const step1 = validateStep(1, empty);
    expect(Object.keys(step1)).toEqual(expect.arrayContaining(["province", "locationDescription", "propertyType", "ownership"]));
    expect(step1.monthlyKwh).toBeUndefined();
    expect(validateStep(2, { ...empty, backupNeeded: "no" }).monthlyKwh).toBeDefined();
  });
  it("account: phone, email and password rules", () => {
    expect(accountSchema.safeParse({ fullName: "A", phone: "+976 99112233", email: "a@b.co", password: "12345678" }).success).toBe(true);
    expect(accountSchema.safeParse({ fullName: "A", phone: "abc", email: "a@b.co", password: "12345678" }).success).toBe(false);
    expect(accountSchema.safeParse({ fullName: "A", phone: "99112233", email: "not-email", password: "12345678" }).success).toBe(false);
    expect(accountSchema.safeParse({ fullName: "A", phone: "99112233", email: "a@b.co", password: "short" }).success).toBe(false);
  });
});

const input = (o: Partial<PrelimInput> = {}): PrelimInput => ({
  monthlyKwh: 400, backupNeeded: "no", installAreaM2: 50, hasCoordinates: true, hasShadingInfo: true, hasCriticalLoads: false, ...o,
});

describe("preliminary sizing", () => {
  it("keeps kW and kWh apart: capacity in kWp is derived from annual kWh and a yield range", () => {
    const r = calculatePrelim(input());
    expect(r.annualKwh).toBe(4800);
    const half = r.options.find((o) => o.id === "offset-50")!;
    expect(half.annualTargetKwh).toBe(2400);
    expect(half.pvKwpRange.low).toBeCloseTo(2400 / 1500, 1);
    expect(half.pvKwpRange.high).toBeCloseTo(2400 / 1100, 1);
    expect(half.pvKwpRange.low).toBeLessThan(half.pvKwpRange.high);
  });
  it("never reports cost, savings, payback or battery size (no such fields exist in the result)", () => {
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k.toLowerCase()); walk(x); }
    };
    const r = calculatePrelim(input({ backupNeeded: "yes", hasCriticalLoads: true }));
    walk(r);
    for (const forbidden of ["payback", "savings", "cost", "price", "batterykwh", "batterysize", "generationkwh"]) {
      expect([...keys].some((k) => k.includes(forbidden)), forbidden).toBe(false);
    }
    expect(r.batteryNote).toBe("needs_critical_load_data");
  });
  it("is labelled preliminary / awaiting verification with a calculation version", () => {
    const r = calculatePrelim(input());
    expect(r.label).toBe("PRELIMINARY — NOT A QUOTATION");
    expect(r.verification).toBe("awaiting_verification");
    expect(r.version).toBe(CALC_VERSION);
    expect(r.limitations).toContain("no_verified_irradiance_model");
  });
  it("without consumption it declines to estimate and says what is missing", () => {
    const r = calculatePrelim(input({ monthlyKwh: null }));
    expect(r.state).toBe("insufficient_data");
    expect(r.options).toEqual([]);
    expect(r.missing).toContain("monthly_kwh");
    expect(r.nextStep).toBe("provide_consumption");
  });
  it("flags when the stated area may not fit and lowers confidence when inputs are missing", () => {
    expect(calculatePrelim(input({ monthlyKwh: 3000, installAreaM2: 10 })).options.some((o) => o.areaCheck === "may_not_fit")).toBe(true);
    expect(calculatePrelim(input({ hasCoordinates: false })).confidence).toBe("low");
    expect(calculatePrelim(input()).confidence).toBe("moderate");
  });
  it("is deterministic: same recorded inputs → identical result", () => {
    expect(calculatePrelim(input())).toEqual(calculatePrelim(JSON.parse(JSON.stringify(input()))));
  });
});
