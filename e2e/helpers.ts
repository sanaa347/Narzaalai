import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/** Must match SEED_PASSWORD in playwright.config.ts. */
export const SEED_PASSWORD = "e2e-demo-password-1";
export const CUSTOMER_PASSWORD = "e2e-customer-pass-1";
export const accounts = {
  staff: "ops@demo.narzaalai.test",
  admin: "admin@demo.narzaalai.test",
  demoHousehold: "household@demo.narzaalai.test",
  demoBusiness: "business@demo.narzaalai.test",
  supplierRole: "supplier-role@e2e.narzaalai.test",
};

let counter = 0;
export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++counter}@example.test`;

export const body = (page: Page) => page.locator("body");

export async function newPage(browser: Browser, viewport = { width: 1366, height: 900 }, extraHTTPHeaders?: Record<string, string>): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, extraHTTPHeaders });
  return { ctx, page: await ctx.newPage() };
}

/** Signs in and waits to leave /login. */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 }), page.click('button[type="submit"]')]);
}

/** Attempts a sign-in that must fail; returns the visible error text and asserts the user stayed on /login. */
export async function loginFails(page: Page, email: string, password: string): Promise<string> {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  const alert = page.getByRole("alert").filter({ hasText: /\S/ }).first(); // skip Next's empty route announcer
  await expect(alert).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/login");
  return (await alert.innerText()).trim();
}

/** Clicks the confirm button of the open confirmation dialog (the last button by convention). */
export async function confirmDialog(page: Page): Promise<void> {
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  const btns = dlg.getByRole("button");
  await btns.nth((await btns.count()) - 1).click();
  await expect(dlg).toBeHidden();
}

export interface WizardData {
  type: "household" | "business";
  email: string;
  password?: string;
  fullName?: string;
  monthlyKwh?: string;
  usageUnknown?: boolean;
}

export async function startWizard(page: Page, type: "household" | "business"): Promise<void> {
  await page.goto("/assess");
  await page.locator(`input[name="customerType"][value="${type}"]`).check({ force: true });
  await page.getByRole("button", { name: "Үргэлжлүүлэх" }).click();
}

export async function fillSiteStep(page: Page, d: WizardData): Promise<void> {
  await page.fill('input[name="fullName"]', d.fullName ?? "Тест Хэрэглэгч (e2e)");
  await page.fill('input[name="phone"]', "99112233");
  await page.fill('input[name="email"]', d.email);
  await page.fill('input[name="province"]', "Төв аймаг");
  await page.fill('textarea[name="locationDescription"]', "Сумын төвөөс 15 км, e2e тест өгөгдөл");
  await page.locator('select[name="propertyType"]').selectOption({ index: 1 });
  await page.locator('select[name="ownership"]').selectOption({ index: 1 });
}

export async function fillUsageStep(page: Page, d: WizardData): Promise<void> {
  if (d.usageUnknown) await page.locator('input[type="checkbox"]').first().check();
  else await page.fill('input[name="monthlyKwh"]', d.monthlyKwh ?? "420");
  await page.locator('select[name="backupNeeded"]').selectOption({ index: 1 });
  if (d.type === "business") {
    await page.fill('input[name="businessName"]', "Тест ХХК (e2e)");
    await page.fill('input[name="businessCategory"]', "Дэлгүүр");
    await page.fill('input[name="businessOperatingHours"]', "09:00-18:00");
    await page.fill('textarea[name="businessUsagePattern"]', "Өдрийн цагаар, хөргөгч 24 цаг");
  }
}

export async function fillObjectivesStep(page: Page): Promise<void> {
  await page.locator('input[type="checkbox"]').first().check();
  await page.locator('select[name="timeframe"]').selectOption({ index: 1 });
}

const next = (page: Page) => page.getByRole("button", { name: "Үргэлжлүүлэх" }).click();

/** Completes the whole wizard as a new customer; resolves with the reference and project id. */
export async function submitAssessment(page: Page, d: WizardData): Promise<{ reference: string; projectId: string }> {
  await startWizard(page, d.type);
  await fillSiteStep(page, d);
  await next(page);
  await fillUsageStep(page, d);
  await next(page);
  await fillObjectivesStep(page);
  await next(page);
  await page.locator('input[type="password"]').fill(d.password ?? CUSTOMER_PASSWORD);
  await page.locator('input[type="checkbox"]').last().check();
  await Promise.all([page.waitForURL(/\/dashboard\/projects\//, { timeout: 30_000 }), page.getByRole("button", { name: "Хүсэлт илгээх" }).click()]);
  const projectId = new URL(page.url()).pathname.split("/").pop()!;
  const reference = ((await body(page).innerText()).match(/NZ-\d{4}-\d{6}/) ?? [])[0];
  expect(reference, "a request reference should be shown after submission").toBeTruthy();
  return { reference: reference!, projectId };
}

/** Staff status change through the confirmation dialog. Returns nothing; assert on the page afterwards. */
export async function changeStatus(page: Page, projectId: string, to: string, note = `e2e: ${to}`, opts: { customerVisibleNote?: boolean; documentLabel?: RegExp } = {}): Promise<void> {
  await page.goto(`/ops/projects/${projectId}`);
  const form = page.locator('form:has(select[name="to"])');
  await form.locator('select[name="to"]').selectOption(to);
  await form.locator('textarea[name="note"]').fill(note);
  if (opts.customerVisibleNote) await form.locator('input[name="noteVisible"]').check();
  if (opts.documentLabel) {
    const label = (await form.locator('select[name="documentId"] option').allInnerTexts()).find((t) => opts.documentLabel!.test(t));
    expect(label, "evidence document option").toBeTruthy();
    await form.locator('select[name="documentId"]').selectOption({ label });
  }
  await form.getByRole("button", { name: "Change status" }).click();
  await confirmDialog(page);
}

export async function statusOptions(page: Page, projectId: string): Promise<string[]> {
  await page.goto(`/ops/projects/${projectId}`);
  return (await page.locator('select[name="to"] option').allInnerTexts()).map((t) => t.trim()).filter((t) => t && t !== "Choose…");
}

/** A tiny but structurally valid PDF (passes the server's magic-byte check). */
export const pdfBytes = (marker = "e2e"): Buffer =>
  Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${marker} — test document, not a real report\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
