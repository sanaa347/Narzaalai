import { expect, test, type Page } from "@playwright/test";
import { accounts, body, login, newPage, SEED_PASSWORD } from "./helpers";
import { createSupplier } from "./ops-helpers";

/**
 * Honesty rules checked on the RENDERED pages: sample records are visibly marked, sample prices are never presented as
 * confirmed offers, the preliminary plan makes no cost/savings/payback claim, and monitoring never pretends to be live.
 */

const DEMO_BADGE = "DEMO · not real";

async function demoRows(page: Page): Promise<{ withDemoName: number; withoutBadge: string[] }> {
  const rows = page.locator("tbody tr");
  const n = await rows.count();
  let withDemoName = 0;
  const withoutBadge: string[] = [];
  for (let i = 0; i < n; i++) {
    const text = await rows.nth(i).innerText();
    if (!text.includes("ДЕМО")) continue;
    withDemoName++;
    if (!text.includes(DEMO_BADGE)) withoutBadge.push(text.replace(/\s+/g, " ").slice(0, 80));
  }
  return { withDemoName, withoutBadge };
}

test.describe("sample (demo) records are visibly marked everywhere staff see them", () => {
  for (const path of ["/ops/suppliers", "/ops/products", "/ops/quotes", "/ops/customers", "/ops/projects"]) {
    test(`${path}: every sample row carries the "${DEMO_BADGE}" badge`, async ({ browser }) => {
      const { ctx, page } = await newPage(browser);
      try {
        await login(page, accounts.staff, SEED_PASSWORD);
        await page.goto(path);
        await expect(page.getByText(DEMO_BADGE).first()).toBeVisible();
        const { withoutBadge } = await demoRows(page);
        expect(withoutBadge, "sample rows without a DEMO badge").toEqual([]);
      } finally { await ctx.close(); }
    });
  }

  test("sample prices are never shown as a confirmed offer, and the overview warns that demo data is present", async ({ browser }) => {
    const { ctx, page } = await newPage(browser);
    try {
      await login(page, accounts.staff, SEED_PASSWORD);
      await page.goto("/ops/quotes");
      const rows = page.locator("tbody tr", { hasText: "ДЕМО" });
      expect(await rows.count()).toBeGreaterThan(0);
      for (let i = 0; i < (await rows.count()); i++) await expect(rows.nth(i)).not.toContainText("Confirmed offer");
      await page.goto("/ops");
      await expect(body(page)).toContainText("Demo data present");
    } finally { await ctx.close(); }
  });

  test("a real record that staff create is not labelled as a sample, and not described as verified", async ({ browser }) => {
    const { ctx, page } = await newPage(browser);
    try {
      await login(page, accounts.staff, SEED_PASSWORD);
      await createSupplier(page, "E2E Honest Real Supplier");
      await page.goto("/ops/suppliers");
      const row = page.locator("tbody tr", { hasText: "E2E Honest Real Supplier" });
      await expect(row).toBeVisible();
      await expect(row).not.toContainText(DEMO_BADGE);
      await expect(row).not.toContainText(/verified installer|certified|approved/i);
    } finally { await ctx.close(); }
  });
});

test.describe("technical honesty", () => {
  test("the customer's preliminary plan is labelled preliminary, shows its calculation version, and makes no cost/savings/payback claim", async ({ browser }) => {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844 });
    try {
      await login(page, accounts.demoHousehold, SEED_PASSWORD);
      await page.goto("/dashboard");
      await page.locator('a[href^="/dashboard/projects/"]').first().click();
      await page.waitForURL(/\/dashboard\/projects\//);
      const text = await body(page).innerText();
      expect(text).toContain("УРЬДЧИЛСАН ТООЦОО — ҮНИЙН САНАЛ БИШ"); // PRELIMINARY — NOT A QUOTATION
      expect(text).toMatch(/prelim-sizing-\d+\.\d+\.\d+/);
      expect(text).not.toMatch(/payback|savings|ROI|return on investment|эргэн төлөгд|хэмнэх хэмжээ/i);
      expect(text).not.toMatch(/guaranteed|баталгаатай хэмнэлт/i);
      // The "different states" ladder says live monitoring does not exist yet.
      await expect(body(page)).toContainText("Бодит хяналтын өгөгдөл");
    } finally { await ctx.close(); }
  });

  test("the Control Center states that no live equipment integration exists and shows no readings", async ({ browser }) => {
    const { ctx, page } = await newPage(browser);
    try {
      await login(page, accounts.staff, SEED_PASSWORD);
      await page.goto("/ops/monitoring");
      await expect(body(page)).toContainText("No live equipment integration is configured");
      await expect(body(page)).toContainText("No telemetry stored");
      await expect(body(page)).toContainText("DEMO DATA — NOT LIVE EQUIPMENT DATA"); // the mandatory label is documented on the page
      await expect(body(page)).toContainText("no remote switching and no grid-disconnection");
      // Nothing on the page offers to control equipment.
      await expect(page.getByRole("button", { name: /switch|disconnect|turn (on|off)|toggle/i })).toHaveCount(0);
    } finally { await ctx.close(); }
  });
});
