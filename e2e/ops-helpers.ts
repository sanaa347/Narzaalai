import { expect, type Locator, type Page } from "@playwright/test";
import { body, confirmDialog } from "./helpers";

/** YYYY-MM-DD, `offsetDays` from today (UTC, as the app compares dates). */
export const isoDay = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

export type Outcome = { ok: boolean; text: string };

/** Waits for the first non-empty alert/status message inside `scope` (Next's own empty route announcer is ignored). */
export async function outcome(scope: Page | Locator): Promise<Outcome> {
  const msg = scope.locator('[role="alert"], [role="status"]').filter({ hasText: /\S/ }).first();
  await expect(msg).toBeVisible({ timeout: 15_000 });
  return { ok: (await msg.getAttribute("role")) === "status", text: (await msg.innerText()).trim() };
}

/** Sets a <select>/<input> to a value the UI never offered — i.e. simulates a hand-crafted request. */
export async function forceValue(el: Locator, value: string): Promise<void> {
  await el.evaluate((node, v) => {
    if (node instanceof HTMLSelectElement && !Array.from(node.options).some((o) => o.value === v)) {
      const o = document.createElement("option");
      o.value = v;
      o.text = v;
      node.add(o);
    }
    (node as HTMLInputElement | HTMLSelectElement).value = v;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

export async function projectStatus(page: Page, projectId: string): Promise<string> {
  await page.goto(`/ops/projects/${projectId}`);
  return (await page.getByTestId("project-status").getAttribute("data-status")) ?? "";
}

export async function createSupplier(page: Page, name: string): Promise<void> {
  await page.goto("/ops/suppliers/new");
  const form = page.locator('form:has(input[name="companyName"])');
  await form.locator('input[name="companyName"]').fill(name);
  await form.locator('input[name="serviceArea"]').fill("Ulaanbaatar (e2e)");
  await form.locator('button[type="submit"]').click();
  await expect(async () => {
    await page.goto("/ops/suppliers");
    await expect(body(page)).toContainText(name);
  }).toPass({ timeout: 15_000 });
}

export interface QuoteLineInput { description: string; quantity: string; unitPrice: string; manufacturer?: string; model?: string }
export interface QuoteInput {
  supplier: string;
  projectId: string;
  reference: string;
  source?: "supplier_quotation" | "indicative";
  currency?: "MNT" | "USD";
  /** null = no validity date recorded. */
  validUntil: string | null;
  /** Defaults to today. An expired quotation must be an old one: valid-until may not precede the quotation date. */
  quoteDate?: string;
  receivedOn?: string;
  lines: QuoteLineInput[];
  installation?: string;
  delivery?: string;
  taxes?: string;
  otherCharges?: string;
  pvKwp?: string;
  batteryKwh?: string;
  leadTimeDays?: string;
  warranty?: string;
  exclusions?: string;
}

/** Enters a quotation through the real form and returns its id (from the URL it lands on). */
export async function createQuote(page: Page, q: QuoteInput): Promise<string> {
  await page.goto(`/ops/quotes/new?projectId=${q.projectId}`);
  const form = page.locator('form:has(select[name="supplierId"])');
  await form.locator('select[name="supplierId"]').selectOption({ label: q.supplier });
  await form.locator('input[name="reference"]').fill(q.reference);
  if (q.currency) await form.locator('select[name="currency"]').selectOption(q.currency);
  await form.locator('select[name="sourceType"]').selectOption(q.source ?? "supplier_quotation");
  await form.locator('input[name="quoteDate"]').fill(q.quoteDate ?? isoDay(0));
  await form.locator('input[name="receivedOn"]').fill(q.receivedOn ?? isoDay(0));
  if (q.validUntil) await form.locator('input[name="validUntil"]').fill(q.validUntil);
  await form.locator('textarea[name="sourceNote"]').fill("E2E test data typed in by the test runner — not a real supplier offer.");

  for (let i = 0; i < q.lines.length; i++) {
    if (i > 0) await form.getByRole("button", { name: "Add line" }).click();
    const card = form.locator("fieldset div.rounded-lg.p-3").nth(i);
    const l = q.lines[i];
    await card.getByLabel(/Description/).fill(l.description);
    await card.getByLabel(/Quantity/).fill(l.quantity);
    await card.getByLabel(/Unit price/).fill(l.unitPrice);
    if (l.manufacturer) await card.getByLabel(/Manufacturer/).fill(l.manufacturer);
    if (l.model) await card.getByLabel(/^Model/).fill(l.model);
  }
  const maybe = async (name: string, v?: string) => { if (v !== undefined) await form.locator(`[name="${name}"]`).fill(v); };
  await maybe("installation", q.installation);
  await maybe("delivery", q.delivery);
  await maybe("taxes", q.taxes);
  await maybe("otherCharges", q.otherCharges);
  await maybe("pvKwp", q.pvKwp);
  await maybe("batteryKwh", q.batteryKwh);
  await maybe("leadTimeDays", q.leadTimeDays);
  await maybe("warrantyTerms", q.warranty);
  await maybe("exclusions", q.exclusions);

  await form.locator('button[type="submit"]').click();
  await page.waitForURL(/\/ops\/quotes\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  return page.url().split("/").pop()!;
}

/** Creates a draft proposal from the given quotations and publishes it. */
export async function createAndPublishProposal(page: Page, projectId: string, quoteIds: string[], title = "E2E system options"): Promise<void> {
  await page.goto(`/ops/projects/${projectId}`);
  const form = page.locator('form:has(input[name="quoteId"][type="checkbox"])');
  await form.locator('input[name="title"]').fill(title);
  for (const id of quoteIds) await form.locator(`input[name="quoteId"][value="${id}"]`).check();
  await form.getByRole("button", { name: "Create draft proposal" }).click();
  expect((await outcome(form)).ok).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Publish to customer" }).click();
  await confirmDialog(page);
  await expect(async () => {
    expect(await projectStatus(page, projectId)).toBe("PROPOSAL_READY");
  }).toPass({ timeout: 15_000 });
}

/** Staff status change. Returns the outcome message (so tests can assert on refusals as well as successes). */
export async function tryStatus(
  page: Page, projectId: string, to: string,
  o: { note?: string; documentLabel?: RegExp; forged?: boolean } = {},
): Promise<Outcome> {
  await page.goto(`/ops/projects/${projectId}`);
  const form = page.locator('form:has(select[name="to"])');
  if (o.forged) await forceValue(form.locator('select[name="to"]'), to);
  else await form.locator('select[name="to"]').selectOption(to);
  await form.locator('textarea[name="note"]').fill(o.note ?? `e2e: ${to}`);
  if (o.documentLabel) {
    const label = (await form.locator('select[name="documentId"] option').allInnerTexts()).find((t) => o.documentLabel!.test(t));
    expect(label, "evidence document option").toBeTruthy();
    await form.locator('select[name="documentId"]').selectOption({ label });
  }
  await form.getByRole("button", { name: "Change status" }).click();
  await confirmDialog(page);
  return outcome(form);
}

export async function uploadStaffDocument(
  page: Page, projectId: string, typeLabel: string, fileName: string, bytes: Buffer, o: { mimeType?: string; customerVisible?: boolean } = {},
): Promise<Outcome> {
  await page.goto(`/ops/projects/${projectId}`);
  const form = page.locator('form:has(input[type="file"][name="file"])').first();
  await form.locator('select[name="docType"]').selectOption({ label: typeLabel });
  await form.locator('input[name="file"]').setInputFiles({ name: fileName, mimeType: o.mimeType ?? "application/pdf", buffer: bytes });
  if (o.customerVisible) await form.locator('input[name="customerVisible"]').check();
  await form.getByRole("button", { name: "Upload" }).click();
  return outcome(form);
}

/** The /api/documents/<id> path for a file listed on a staff project page. */
export async function documentHref(page: Page, projectId: string, fileName: string): Promise<string> {
  await page.goto(`/ops/projects/${projectId}`);
  const href = await page.locator("a[href^='/api/documents/']", { hasText: fileName }).first().getAttribute("href");
  expect(href, `document link for ${fileName}`).toBeTruthy();
  return href!;
}
