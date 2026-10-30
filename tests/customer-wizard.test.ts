import { describe, expect, it } from "vitest";
import { initialValues, splitServerErrors, summarize, toPayload, validateWizardStep } from "@/components/assess/wizard-logic";

describe("customer wizard logic", () => {
  it("never puts contact or password fields into the server payload", () => {
    const p = toPayload({ ...initialValues("household"), fullName: "A", phone: "99112233", email: "a@b.mn", password: "x" });
    expect(p).not.toHaveProperty("fullName");
    expect(p).not.toHaveProperty("password");
  });
  it("requires business fields only for business customers", () => {
    const base = { ...initialValues("business"), usageUnknown: true, backupNeeded: "no" };
    expect(validateWizardStep(2, base, "", true)).toHaveProperty("businessName");
    expect(validateWizardStep(2, { ...base, customerType: "household" }, "", true)).not.toHaveProperty("businessName");
  });
  it("jumps to the earliest step with a server error", () => {
    expect(splitServerErrors({ timeframe: "x", province: "y" }).step).toBe(1);
  });
  it("review summary hides contact rows when signed in", () => {
    const rows = summarize(initialValues("household"), true)[1].items.map((i) => i.label);
    expect(rows).not.toContain("Нэр");
  });
});
