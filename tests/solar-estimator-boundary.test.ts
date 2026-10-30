import { describe, expect, it } from "vitest";
import { runEstimate, prelimEstimator, UnvalidatedClaimError, type Estimator } from "@/lib/solar/estimator";
import { calculatePrelim, type PrelimInput } from "@/lib/solar/prelim";

const input: PrelimInput = { monthlyKwh: 400, backupNeeded: "no", installAreaM2: 50, hasCoordinates: true, hasShadingInfo: true, hasCriticalLoads: false };

const fake = (result: Record<string, unknown>, validation: Estimator<PrelimInput, { version: string }>["validation"]): Estimator<PrelimInput, { version: string }> => ({
  id: "fake", version: "fake-1", validation, estimate: () => ({ version: "fake-1", ...result }),
});
const EVIDENCE = { reference: "REPORT-2026-014", validatedOn: "2026-09-30", scope: "measured output of 3 pilot sites" };

describe("the current estimator (no validation evidence)", () => {
  it("is not validated and returns exactly what calculatePrelim returns (stored JSON shape and reproducibility unchanged)", () => {
    expect(prelimEstimator.validation).toBeNull();
    expect(runEstimate(prelimEstimator, input)).toEqual(calculatePrelim(input));
    expect(runEstimate(prelimEstimator, { ...input, monthlyKwh: null })).toEqual(calculatePrelim({ ...input, monthlyKwh: null }));
  });
});

describe("runEstimate guard", () => {
  it.each([
    "generationKwhPerYear", "annualGeneration", "savingsMnt", "paybackYears", "systemCostMnt", "pricePerKwp", "tariff", "batteryKwh", "batterySizeKwh", "irr", "roi",
  ])("refuses an unvalidated estimator returning %s, even when nested", (key) => {
    expect(() => runEstimate(fake({ options: [{ [key]: 1 }] }, null), input)).toThrow(UnvalidatedClaimError);
  });

  it("allows an estimator that declares validation evidence to return such figures", () => {
    const r = runEstimate(fake({ generationKwhPerYear: 5000, paybackYears: 7 }, EVIDENCE), input);
    expect(r).toMatchObject({ generationKwhPerYear: 5000 });
  });

  it("rejects evidence that is empty or has a bad date (a checkbox with nothing behind it)", () => {
    expect(() => runEstimate(fake({}, { ...EVIDENCE, reference: " " }), input)).toThrow(/validation evidence/);
    expect(() => runEstimate(fake({}, { ...EVIDENCE, validatedOn: "sometime" }), input)).toThrow(/validation evidence/);
    expect(() => runEstimate(fake({}, { ...EVIDENCE, scope: "" }), input)).toThrow(/validation evidence/);
  });

  it("rejects a result whose version differs from the estimator's declared version (results must be traceable)", () => {
    const bad: Estimator<PrelimInput, { version: string }> = { id: "x", version: "a", validation: null, estimate: () => ({ version: "b" }) };
    expect(() => runEstimate(bad, input)).toThrow(/version/);
  });

  it("the legitimate preliminary result contains none of the validated-only claims", () => {
    expect(() => runEstimate(prelimEstimator, input)).not.toThrow();
  });
});
