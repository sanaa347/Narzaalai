import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { accounts, body, confirmDialog, login, newPage, pdfBytes, SEED_PASSWORD, submitAssessment, uniqueEmail } from "./helpers";
import { createAndPublishProposal, createQuote, createSupplier, isoDay, outcome, projectStatus, tryStatus, uploadStaffDocument } from "./ops-helpers";

/**
 * Installed equipment and warranty records: nothing is invented (no serial numbers, no warranty cover), a warranty
 * counts as evidence-backed only with an attached document, and "commissioned" needs a commissioning/handover document.
 * Also a layout regression: the Control Center overview once overflowed the page on every screen size.
 */
test.describe.configure({ mode: "serial" });

const MOBILE = { width: 390, height: 844 };
const SUPPLIER = "E2E Equipment Supplier (test data)";

let staffCtx: BrowserContext, custCtx: BrowserContext;
let staff: Page, cust: Page;
let projectId = "";

test.beforeAll(async ({ browser }) => {
  const s = await newPage(browser);
  staffCtx = s.ctx; staff = s.page;
  await login(staff, accounts.staff, SEED_PASSWORD);
  const c = await newPage(browser, MOBILE);
  custCtx = c.ctx; cust = c.page;
  ({ projectId } = await submitAssessment(cust, { type: "household", email: uniqueEmail("equipment"), monthlyKwh: "300" }));
});
test.afterAll(async () => { await staffCtx?.close(); await custCtx?.close(); });

async function recordEquipment(page: Page, o: { manufacturer: string; model: string; serial?: string; commissioning?: string }) {
  await page.goto(`/ops/projects/${projectId}`);
  const form = page.locator('form:has(input[name="manufacturer"])').first();
  await form.locator('select[name="category"]').selectOption({ index: 1 });
  await form.locator('input[name="manufacturer"]').fill(o.manufacturer);
  await form.locator('input[name="model"]').fill(o.model);
  if (o.serial) await form.locator('input[name="serialNumber"]').fill(o.serial);
  if (o.commissioning) await form.locator('select[name="commissioningState"]').selectOption(o.commissioning);
  await form.getByRole("button", { name: "Record equipment" }).click();
  return outcome(form);
}

test.describe("getting a project to the installation stage", () => {
  test("quotation → proposal → customer approval → procurement → install scheduled", async () => {
    expect((await tryStatus(staff, projectId, "ASSESSMENT")).ok).toBe(true);
    expect((await tryStatus(staff, projectId, "QUOTE_REQUESTED")).ok).toBe(true);
    await createSupplier(staff, SUPPLIER);
    const quoteId = await createQuote(staff, {
      supplier: SUPPLIER, projectId, reference: "E2E-EQUIP", validUntil: isoDay(30),
      lines: [{ description: "Test equipment set", quantity: "1", unitPrice: "1000000" }],
    });
    await createAndPublishProposal(staff, projectId, [quoteId]);
    await cust.goto(`/dashboard/projects/${projectId}`);
    await cust.getByRole("button", { name: "Энэ хувилбарыг батлах" }).first().click();
    await confirmDialog(cust);
    await expect(async () => { expect(await projectStatus(staff, projectId)).toBe("APPROVED"); }).toPass({ timeout: 15_000 });
    for (const to of ["PROCUREMENT", "INSTALL_SCHEDULED"]) expect((await tryStatus(staff, projectId, to)).ok, to).toBe(true);
  });
});

test.describe("installed equipment", () => {
  test("equipment cannot be recorded before the Installation stage (server-side, not just a UI notice)", async () => {
    expect(await projectStatus(staff, projectId)).toBe("INSTALL_SCHEDULED");
    const out = await recordEquipment(staff, { manufacturer: "TooEarly-Maker", model: "X1" });
    expect(out.ok, out.text).toBe(false);
    await staff.reload();
    await expect(body(staff)).not.toContainText("TooEarly-Maker");
  });

  test("at INSTALLATION equipment is recorded WITHOUT an invented serial number", async () => {
    expect((await tryStatus(staff, projectId, "INSTALLATION")).ok).toBe(true);
    const out = await recordEquipment(staff, { manufacturer: "E2E-Maker", model: "EQ-100" });
    expect(out.ok, out.text).toBe(true);
    await staff.reload();
    const card = staff.locator("div.rounded-lg", { hasText: "E2E-Maker EQ-100" }).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Not commissioned/i);
    // The serial-number cell is empty (rendered as a dash), never a generated value.
    await expect(card.locator("dt", { hasText: "Serial number" }).locator("xpath=following-sibling::dd[1]")).toHaveText(/^\s*—\s*$/);
  });

  test("a serial number is stored only when staff type one from the nameplate", async () => {
    const out = await recordEquipment(staff, { manufacturer: "E2E-Maker", model: "EQ-200", serial: "E2E-NAMEPLATE-0001" });
    expect(out.ok, out.text).toBe(true);
    await staff.reload();
    await expect(body(staff)).toContainText("E2E-NAMEPLATE-0001");
  });

  test("marking equipment 'Commissioned' without a commissioning/handover document is refused", async () => {
    const out = await recordEquipment(staff, { manufacturer: "E2E-Maker", model: "EQ-300", commissioning: "commissioned" });
    expect(out.ok, out.text).toBe(false);
    await staff.reload();
    await expect(body(staff)).not.toContainText("EQ-300");
  });
});

test.describe("warranty records", () => {
  test("a warranty with no document is shown as unverified, and states no cover that was not typed in", async () => {
    await staff.goto(`/ops/projects/${projectId}`);
    const card = staff.locator("div.rounded-lg", { hasText: "E2E-Maker EQ-100" }).first();
    await expect(card).toContainText("None recorded — no warranty is assumed.");
    await card.locator("summary", { hasText: "Add warranty record" }).click();
    const form = card.locator('form:has(input[name="provider"])');
    await form.locator('input[name="provider"]').fill("E2E Warranty Provider");
    await form.getByRole("button", { name: "Add warranty" }).click();
    expect((await outcome(form)).ok).toBe(true);
    await staff.reload();
    const warranty = staff.locator("li", { hasText: "E2E Warranty Provider" }).first();
    await expect(warranty).toContainText(/unverified|not verified|awaiting/i);
    await expect(warranty).not.toContainText(/evidence recorded|verified by/i);
  });

  test("a warranty backed by an uploaded warranty document is marked as having evidence", async () => {
    expect((await uploadStaffDocument(staff, projectId, "Warranty document", "e2e-warranty.pdf", pdfBytes("warranty"))).ok).toBe(true);
    await staff.goto(`/ops/projects/${projectId}`);
    const card = staff.locator("div.rounded-lg", { hasText: "E2E-Maker EQ-200" }).first();
    await card.locator("summary", { hasText: "Add warranty record" }).click();
    const form = card.locator('form:has(input[name="provider"])');
    await form.locator('input[name="provider"]').fill("E2E Documented Provider");
    const label = (await form.locator('select[name="documentId"] option').allInnerTexts()).find((t) => /e2e-warranty\.pdf/.test(t));
    expect(label, "warranty document option").toBeTruthy();
    await form.locator('select[name="documentId"]').selectOption({ label });
    await form.getByRole("button", { name: "Add warranty" }).click();
    expect((await outcome(form)).ok).toBe(true);
    await staff.reload();
    const warranty = staff.locator("li", { hasText: "E2E Documented Provider" }).first();
    await expect(warranty).toContainText(/evidence/i);
    await expect(warranty.getByRole("link", { name: "Evidence document" })).toBeVisible();
  });
});

test.describe("what the customer sees", () => {
  test("the customer sees the recorded equipment but never a staff-only document", async () => {
    await cust.goto(`/dashboard/projects/${projectId}`);
    await expect(body(cust)).toContainText("E2E-Maker");
    await expect(body(cust)).not.toContainText("e2e-warranty.pdf"); // uploaded staff-only by default
  });
});

test.describe("layout regression: no horizontal page overflow", () => {
  const staffPages = ["/ops", "/ops/inbox", "/ops/projects", "/ops/customers", "/ops/suppliers", "/ops/products", "/ops/quotes", "/ops/compare", "/ops/monitoring", "/ops/settings"];
  for (const width of [390, 768, 1366]) {
    test(`Control Center pages fit a ${width}px-wide screen`, async ({ browser }) => {
      const s = await newPage(browser, { width, height: 900 });
      try {
        await login(s.page, accounts.staff, SEED_PASSWORD);
        const wide: string[] = [];
        for (const path of [...staffPages, `/ops/projects/${projectId}`]) {
          await s.page.goto(path);
          const { sw, cw } = await s.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
          if (sw > cw + 1) wide.push(`${path} (${sw}>${cw})`);
        }
        expect(wide, "pages wider than the viewport").toEqual([]);
      } finally { await s.ctx.close(); }
    });
  }

  test("customer dashboard and project page fit a phone screen", async () => {
    const wide: string[] = [];
    for (const path of ["/dashboard", `/dashboard/projects/${projectId}`]) {
      await cust.goto(path);
      const { sw, cw } = await cust.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      if (sw > cw + 1) wide.push(`${path} (${sw}>${cw})`);
    }
    expect(wide).toEqual([]);
  });
});
