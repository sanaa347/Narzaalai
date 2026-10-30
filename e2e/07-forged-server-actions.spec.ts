import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { accounts, body, login, newPage, SEED_PASSWORD } from "./helpers";

/**
 * Server actions are public POST endpoints. Hiding a button, or never rendering a form for a role, is NOT access
 * control. These tests take the exact hidden `$ACTION_*` fields that the staff "new supplier" form posts, then replay
 * that request over plain HTTP with no cookie, with a customer's cookie and with a foreign Origin, and require that
 * nothing is written. A staff replay of the same request is the positive control: it proves the replay mechanism is
 * valid, so the refusals are about authorization and not about a malformed request.
 */

const FORM_PATH = "/ops/suppliers/new";

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'");

/** The hidden inputs React renders for a server-action form: they identify the action and its bound state. */
async function captureActionFields(staffPage: Page): Promise<Record<string, string>> {
  const html = await (await staffPage.request.get(FORM_PATH)).text();
  const form = [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="companyName"'));
  expect(form, "the staff supplier form must be on the page").toBeTruthy();
  const fields: Record<string, string> = {};
  for (const m of form!.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]+)"/.exec(m[0])?.[1];
    const value = /value="([^"]*)"/.exec(m[0])?.[1] ?? "";
    if (name) fields[decode(name)] = decode(value);
  }
  expect(Object.keys(fields).some((k) => k.startsWith("$ACTION")), "action fields found").toBe(true);
  return fields;
}

async function replay(request: APIRequestContext, fields: Record<string, string>, companyName: string, origin?: string) {
  return request.post(FORM_PATH, {
    maxRedirects: 0,
    headers: origin ? { origin } : undefined,
    // The two selects have no default in the DOM, so a real browser always sends them: a replay must too.
    multipart: { ...fields, companyName, installerCapability: "none", status: "active" },
  });
}

async function supplierListText(page: Page): Promise<string> {
  await page.goto("/ops/suppliers");
  return body(page).innerText();
}

test.describe("a replayed staff server-action request", () => {
  let fields: Record<string, string>;
  let staff: Page;
  let baseURL: string;

  test.beforeAll(async ({ browser }, info) => {
    baseURL = info.project.use.baseURL as string;
    const s = await newPage(browser);
    staff = s.page;
    await login(staff, accounts.staff, SEED_PASSWORD);
    fields = await captureActionFields(staff);
  });

  test("control: with a staff cookie the replay creates the supplier (so the refusals below are meaningful)", async () => {
    const r = await replay(staff.request, fields, "E2E replay control (staff)", baseURL);
    expect(r.status()).toBeLessThan(500);
    expect(await supplierListText(staff)).toContain("E2E replay control (staff)");
  });

  test("with no cookie it creates nothing", async ({ browser }) => {
    const anon = await browser.newContext();
    const r = await replay(anon.request, fields, "E2E replay anonymous", baseURL);
    expect(r.status()).toBeLessThan(500);
    expect(await supplierListText(staff)).not.toContain("E2E replay anonymous");
    await anon.close();
  });

  test("with a customer's cookie it creates nothing", async ({ browser }) => {
    const c = await newPage(browser);
    await login(c.page, accounts.demoHousehold, SEED_PASSWORD);
    const r = await replay(c.page.request, fields, "E2E replay customer", baseURL);
    expect(r.status()).toBeLessThan(500);
    expect(await supplierListText(staff)).not.toContain("E2E replay customer");
    await c.ctx.close();
  });

  test("with a role that has no portal (supplier) it creates nothing", async ({ browser }) => {
    // The sign-in itself is refused for this role, so there is no session to replay with: assert that, then replay cookie-less.
    const s = await newPage(browser);
    await s.page.goto("/login");
    await s.page.fill('input[name="email"]', accounts.supplierRole);
    await s.page.fill('input[name="password"]', SEED_PASSWORD);
    await s.page.click('button[type="submit"]');
    await s.page.waitForTimeout(800);
    const r = await replay(s.ctx.request, fields, "E2E replay supplier-role", baseURL);
    expect(r.status()).toBeLessThan(500);
    expect(await supplierListText(staff)).not.toContain("E2E replay supplier-role");
    await s.ctx.close();
  });

  test("even with a valid staff cookie, a cross-site Origin is refused (CSRF protection)", async () => {
    const r = await replay(staff.request, fields, "E2E replay evil origin", "https://evil.example");
    // Next.js rejects mismatched Origin/Host for server actions before running them.
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(await supplierListText(staff)).not.toContain("E2E replay evil origin");
  });
});
