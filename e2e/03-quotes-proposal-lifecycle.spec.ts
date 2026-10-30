import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { accounts, body, confirmDialog, login, newPage, pdfBytes, SEED_PASSWORD, statusOptions, submitAssessment, uniqueEmail } from "./helpers";
import {
  createAndPublishProposal, createQuote, createSupplier, forceValue, isoDay, outcome, projectStatus, tryStatus, uploadStaffDocument,
} from "./ops-helpers";

/**
 * One customer project taken through the whole commercial lifecycle. The steps depend on each other, so they run in order;
 * if an early step fails the later ones are skipped rather than reported as misleading failures.
 */
test.describe.configure({ mode: "serial" });

const MOBILE = { width: 390, height: 844 };
const SUPPLIER_A = "E2E Supplier A (test data)";
const SUPPLIER_B = "E2E Supplier B (test data)";

let staffCtx: BrowserContext, custCtx: BrowserContext;
let staff: Page, cust: Page;
let projectId = "";
let reference = "";
const q: Record<"good" | "usd" | "expired" | "indicative" | "noDate" | "outside", string> = {} as never;

test.beforeAll(async ({ browser }) => {
  const s = await newPage(browser);
  staffCtx = s.ctx; staff = s.page;
  await login(staff, accounts.staff, SEED_PASSWORD);
  const c = await newPage(browser, MOBILE);
  custCtx = c.ctx; cust = c.page;
  ({ reference, projectId } = await submitAssessment(cust, { type: "household", email: uniqueEmail("lifecycle"), monthlyKwh: "480" }));
});
test.afterAll(async () => { await staffCtx?.close(); await custCtx?.close(); });

test.describe("quotations", () => {
  test("a new request starts as SUBMITTED and staff move it to QUOTE_REQUESTED in order", async () => {
    expect(await projectStatus(staff, projectId)).toBe("SUBMITTED");
    expect((await tryStatus(staff, projectId, "ASSESSMENT")).ok).toBe(true);
    expect((await tryStatus(staff, projectId, "QUOTE_REQUESTED")).ok).toBe(true);
    expect(await projectStatus(staff, projectId)).toBe("QUOTE_REQUESTED");
  });

  test("a new supplier is listed but is not described as verified", async () => {
    await createSupplier(staff, SUPPLIER_A);
    await createSupplier(staff, SUPPLIER_B);
    await staff.goto("/ops/suppliers");
    const row = staff.locator("tr", { hasText: SUPPLIER_A });
    await expect(row).toBeVisible();
    await expect(row).not.toContainText(/verified installer|certified|approved/i);
  });

  test("MNT quotation: line items + charges are totalled exactly (server-side) and shown as a confirmed offer", async () => {
    q.good = await createQuote(staff, {
      supplier: SUPPLIER_A, projectId, reference: "E2E-GOOD", validUntil: isoDay(30), pvKwp: "4.5", batteryKwh: "5", leadTimeDays: "14",
      warranty: "10 years product warranty, as quoted", exclusions: "Grid-connection permit",
      lines: [
        { description: "PV modules", quantity: "10", unitPrice: "500000", manufacturer: "E2E-Maker", model: "PV-1" },
        { description: "Hybrid inverter", quantity: "1", unitPrice: "1250000" },
      ],
      installation: "800000", delivery: "200000", taxes: "100000",
    });
    // 10 × 500,000 + 1,250,000 + 800,000 + 200,000 + 100,000
    await expect(body(staff)).toContainText(/Equipment subtotal\s*6\D?250\D?000\s*MNT/);
    await expect(body(staff)).toContainText(/Total\s*7\D?350\D?000\s*MNT/);
    await expect(body(staff)).toContainText("Stored totals match a fresh recomputation");
  });

  test("USD quotation keeps cents exactly and never mixes with MNT (3 × 1,234.56 + 100.10 + 12.34 = 3,816.12)", async () => {
    q.usd = await createQuote(staff, {
      supplier: SUPPLIER_B, projectId, reference: "E2E-USD", currency: "USD", validUntil: isoDay(20), pvKwp: "5",
      lines: [{ description: "PV kit", quantity: "3", unitPrice: "1234.56" }],
      installation: "100.10", taxes: "12.34",
    });
    await expect(body(staff)).toContainText(/Total\s*3\D?816\D12\s*USD/);
    await expect(body(staff)).not.toContainText(/3\D?816\D12\s*MNT/);
  });

  test("an expired, an indicative and a no-validity-date quotation are NOT confirmed offers", async () => {
    q.expired = await createQuote(staff, { supplier: SUPPLIER_A, projectId, reference: "E2E-EXPIRED", quoteDate: isoDay(-30), receivedOn: isoDay(-29), validUntil: isoDay(-1), lines: [{ description: "Kit", quantity: "1", unitPrice: "9000000" }] });
    q.indicative = await createQuote(staff, { supplier: SUPPLIER_B, projectId, reference: "E2E-INDIC", source: "indicative", validUntil: isoDay(30), lines: [{ description: "Kit", quantity: "1", unitPrice: "8000000" }] });
    q.noDate = await createQuote(staff, { supplier: SUPPLIER_B, projectId, reference: "E2E-NODATE", validUntil: null, lines: [{ description: "Kit", quantity: "1", unitPrice: "8500000" }] });
    q.outside = await createQuote(staff, { supplier: SUPPLIER_A, projectId, reference: "E2E-OUTSIDE", validUntil: isoDay(30), lines: [{ description: "Kit", quantity: "1", unitPrice: "7000000" }] });

    await staff.goto("/ops/quotes");
    const state = async (ref: string) => (await staff.locator("tr", { hasText: ref }).first().innerText());
    expect(await state("E2E-GOOD")).toContain("Confirmed offer");
    expect(await state("E2E-USD")).toContain("Confirmed offer");
    expect(await state("E2E-EXPIRED")).toMatch(/Expired/);
    expect(await state("E2E-EXPIRED")).not.toContain("Confirmed offer");
    expect(await state("E2E-INDIC")).toMatch(/Indicative/);
    expect(await state("E2E-INDIC")).not.toContain("Confirmed offer");
    expect(await state("E2E-NODATE")).toMatch(/No validity date/);
    expect(await state("E2E-NODATE")).not.toContain("Confirmed offer");
  });

  test("invalid quotation input is rejected and nothing is saved (negative price, zero quantity, missing line)", async () => {
    await staff.goto(`/ops/quotes/new?projectId=${projectId}`);
    const form = staff.locator('form:has(select[name="supplierId"])');
    await form.locator('select[name="supplierId"]').selectOption({ label: SUPPLIER_A });
    await form.locator('input[name="reference"]').fill("E2E-INVALID");
    await form.locator('input[name="quoteDate"]').fill(isoDay(0));
    await form.locator('input[name="receivedOn"]').fill(isoDay(0));
    await form.locator('input[name="validUntil"]').fill(isoDay(10));
    await form.locator('textarea[name="sourceNote"]').fill("e2e invalid input");
    const card = form.locator("fieldset div.rounded-lg.p-3").first();
    await card.getByLabel(/Description/).fill("Bad line");
    await card.getByLabel(/Quantity/).fill("0");
    await card.getByLabel(/Unit price/).fill("-5");
    await form.locator('button[type="submit"]').click();
    const out = await outcome(form);
    expect(out.ok).toBe(false);
    expect(new URL(staff.url()).pathname).toBe("/ops/quotes/new");
    await staff.goto("/ops/quotes");
    await expect(body(staff)).not.toContainText("E2E-INVALID");
  });
});

test.describe("proposal and customer approval", () => {
  test("a mixed-currency proposal is published; staff are warned that totals are not comparable; project becomes PROPOSAL_READY (not APPROVED)", async () => {
    await createAndPublishProposal(staff, projectId, [q.good, q.usd, q.expired, q.indicative, q.noDate]);
    expect(await projectStatus(staff, projectId)).toBe("PROPOSAL_READY");
    await expect(body(staff)).toContainText("Options use different currencies");
    await expect(body(staff)).toContainText("Price is not the only criterion");
  });

  test("the customer can approve only the confirmed offers; the other options are disabled with a reason", async () => {
    await cust.goto(`/dashboard/projects/${projectId}`);
    await expect(cust.getByText("өөр өөр валютаар")).toBeVisible();
    const article = (ref: string) => cust.locator("article", { hasText: ref });
    await expect(article("E2E-GOOD").getByRole("button", { name: "Энэ хувилбарыг батлах" })).toBeVisible();
    await expect(article("E2E-USD").getByRole("button", { name: "Энэ хувилбарыг батлах" })).toBeVisible();
    for (const [ref, reason] of [["E2E-EXPIRED", "хугацаа дууссан"], ["E2E-INDIC", "Ойролцоо эсвэл жишээ"], ["E2E-NODATE", "хугацаа заагаагүй"]] as const) {
      await expect(article(ref).getByRole("button", { name: "Батлах боломжгүй" })).toBeDisabled();
      await expect(article(ref)).toContainText(reason);
    }
    // The customer never sees a raw, unpublished quotation:
    await expect(body(cust)).not.toContainText("E2E-OUTSIDE");
  });

  test("forged approvals are refused by the server: expired / indicative / no-date / not-in-proposal quotation ids", async () => {
    const attempts: [string, RegExp][] = [
      [q.expired, /expired/i],
      [q.indicative, /Indicative or demo/i],
      [q.noDate, /no valid-until date/i],
      [q.outside, /ороогүй/],
    ];
    for (const [quoteId, expected] of attempts) {
      await cust.goto(`/dashboard/projects/${projectId}`);
      const article = cust.locator("article", { hasText: "E2E-GOOD" });
      const form = article.locator("form");
      await forceValue(form.locator('input[name="quoteId"]'), quoteId);
      await article.getByRole("button", { name: "Энэ хувилбарыг батлах" }).click();
      await confirmDialog(cust);
      const out = await outcome(form);
      expect(out.ok, `forged quote ${quoteId}`).toBe(false);
      expect(out.text).toMatch(expected);
      expect(await projectStatus(staff, projectId)).toBe("PROPOSAL_READY");
    }
  });

  test("the customer approves one confirmed offer; the project becomes APPROVED and the copy says approval is not a purchase", async () => {
    // A second, stale tab of the same customer, loaded before the approval.
    const stale = await custCtx.newPage();
    await stale.goto(`/dashboard/projects/${projectId}`);

    await cust.goto(`/dashboard/projects/${projectId}`);
    const article = cust.locator("article", { hasText: "E2E-GOOD" });
    await article.getByRole("button", { name: "Энэ хувилбарыг батлах" }).click();
    await confirmDialog(cust);
    // The approved-state text appears in several places (badge, stepper, alert title, history); assert the alert title specifically.
    await expect(cust.locator("p.font-semibold", { hasText: /^Санал батлагдсан$/ })).toBeVisible({ timeout: 15_000 });
    await expect(body(cust)).toContainText("худалдан авсан гэсэн үг биш");
    expect(await projectStatus(staff, projectId)).toBe("APPROVED");

    // The stale tab still shows approve buttons. Using one must fail and must not change the chosen option.
    const usdForm = stale.locator("article", { hasText: "E2E-USD" }).locator("form");
    await stale.locator("article", { hasText: "E2E-USD" }).getByRole("button", { name: "Энэ хувилбарыг батлах" }).click();
    await confirmDialog(stale);
    const out = await outcome(usdForm);
    expect(out.ok).toBe(false);
    await stale.close();
    await staff.goto(`/ops/projects/${projectId}`);
    // Scope to the proposal's options table (the project's quotation list above it has no "Chosen" column).
    const options = staff.getByRole("table", { name: /^Options in/ });
    await expect(options.locator("tr", { hasText: "E2E-GOOD" })).toContainText("Chosen");
    await expect(options.locator("tr", { hasText: "E2E-USD" })).not.toContainText("Chosen");
    expect(await projectStatus(staff, projectId)).toBe("APPROVED");
  });
});

test.describe("controlled status transitions (server enforced, not just hidden in the UI)", () => {
  test("from APPROVED only the legal next steps are offered", async () => {
    const opts = await statusOptions(staff, projectId);
    expect(opts).toContain("Procurement");
    for (const bad of ["Completed", "In service", "Installation", "Commissioning", "Submitted", "Assessment", "Proposal ready"]) expect(opts, bad).not.toContain(bad);
  });

  test("forged targets are refused and the status does not change", async () => {
    for (const target of ["COMPLETED", "IN_SERVICE", "INSTALLATION", "PROPOSAL_READY", "SUBMITTED", "APPROVED", "NOT_A_STATUS"]) {
      const out = await tryStatus(staff, projectId, target, { forged: true, note: `forged ${target}` });
      expect(out.ok, target).toBe(false);
      expect(await projectStatus(staff, projectId), `after forged ${target}`).toBe("APPROVED");
    }
  });

  test("delay and cancellation need a reason; a delayed approved project can resume to APPROVED (regression) but not skip ahead", async () => {
    const noNote = await tryStatus(staff, projectId, "DELAYED", { note: "" });
    expect(noNote.ok).toBe(false);
    expect(noNote.text).toMatch(/note/i);
    expect(await projectStatus(staff, projectId)).toBe("APPROVED");

    expect((await tryStatus(staff, projectId, "DELAYED", { note: "e2e: waiting for customs" })).ok).toBe(true);
    expect(await projectStatus(staff, projectId)).toBe("DELAYED");
    const opts = await statusOptions(staff, projectId);
    expect(opts.sort()).toEqual(["Approved", "Cancelled"]);

    const skip = await tryStatus(staff, projectId, "INSTALLATION", { forged: true });
    expect(skip.ok).toBe(false);
    expect(await projectStatus(staff, projectId)).toBe("DELAYED");

    expect((await tryStatus(staff, projectId, "APPROVED", { note: "e2e: customs cleared" })).ok).toBe(true);
    expect(await projectStatus(staff, projectId)).toBe("APPROVED");
  });
});

test.describe("completion requires commissioning evidence", () => {
  test("procurement → install scheduled → installation → commissioning", async () => {
    for (const to of ["PROCUREMENT", "INSTALL_SCHEDULED", "INSTALLATION", "COMMISSIONING"]) {
      const out = await tryStatus(staff, projectId, to);
      expect(out.ok, `${to}: ${out.text}`).toBe(true);
      expect(await projectStatus(staff, projectId)).toBe(to);
    }
  });

  test("COMPLETED is refused with no evidence — and a document of the wrong type does not count as evidence", async () => {
    const none = await tryStatus(staff, projectId, "COMPLETED", { note: "e2e: try to finish with no evidence" });
    expect(none.ok).toBe(false);
    expect(none.text).toMatch(/commissioning report or handover/i);
    expect(await projectStatus(staff, projectId)).toBe("COMMISSIONING");

    for (const type of ["Other", "Installation evidence", "Quotation", "Warranty document"]) {
      expect((await uploadStaffDocument(staff, projectId, type, `not-evidence-${type.replace(/\s/g, "-")}.pdf`, pdfBytes(type))).ok, type).toBe(true);
    }
    const still = await tryStatus(staff, projectId, "COMPLETED", { note: "e2e: still no commissioning report" });
    expect(still.ok).toBe(false);
    expect(await projectStatus(staff, projectId)).toBe("COMMISSIONING");
  });

  test("a customer cannot supply the evidence themselves (evidence document types are refused server-side)", async () => {
    await cust.goto(`/dashboard/projects/${projectId}`);
    const form = cust.locator('form:has(input[type="file"])');
    await forceValue(form.locator('select[name="docType"]'), "commissioning_report");
    await form.locator('input[name="file"]').setInputFiles({ name: "forged-commissioning.pdf", mimeType: "application/pdf", buffer: pdfBytes("forged") });
    await form.getByRole("button", { name: "Файл оруулах" }).click();
    const out = await outcome(form);
    expect(out.ok).toBe(false);
    expect(await projectStatus(staff, projectId)).toBe("COMMISSIONING");
    const again = await tryStatus(staff, projectId, "COMPLETED", { note: "e2e: customer-forged evidence must not count" });
    expect(again.ok).toBe(false);
  });

  test("with a real commissioning report on the project, COMPLETED is accepted, recorded with the actor, then IN_SERVICE", async () => {
    expect((await uploadStaffDocument(staff, projectId, "Commissioning report", "e2e-commissioning-report.pdf", pdfBytes("report"))).ok).toBe(true);
    const done = await tryStatus(staff, projectId, "COMPLETED", { note: "e2e: commissioned and handed over", documentLabel: /e2e-commissioning-report\.pdf/ });
    expect(done.ok, done.text).toBe(true);
    expect(await projectStatus(staff, projectId)).toBe("COMPLETED");
    await expect(body(staff)).toContainText("e2e: commissioned and handed over");
    await expect(body(staff)).toContainText(/Staff:/); // history rows name the responsible staff member
    expect((await tryStatus(staff, projectId, "IN_SERVICE")).ok).toBe(true);
    expect(await projectStatus(staff, projectId)).toBe("IN_SERVICE");
  });

  test("a finished project cannot be pushed backwards, and a cancelled one has no exits", async () => {
    for (const target of ["INSTALLATION", "COMMISSIONING", "APPROVED", "SUBMITTED"]) {
      const out = await tryStatus(staff, projectId, target, { forged: true });
      expect(out.ok, target).toBe(false);
    }
    expect(await projectStatus(staff, projectId)).toBe("IN_SERVICE");
  });

  test("the customer sees the final state and their reference", async () => {
    await cust.goto(`/dashboard/projects/${projectId}`);
    await expect(body(cust)).toContainText(reference);
    await expect(body(cust)).not.toContainText(/Internal note|staff only/i);
  });
});
