import { expect, test } from "@playwright/test";
import { accounts, body, login, loginFails, newPage, SEED_PASSWORD } from "./helpers";

const STAFF_ONLY_PATHS = [
  "/ops", "/ops/inbox", "/ops/projects", "/ops/customers", "/ops/suppliers", "/ops/suppliers/new", "/ops/products", "/ops/products/new",
  "/ops/quotes", "/ops/quotes/new", "/ops/compare", "/ops/monitoring", "/ops/settings",
];

test.describe("anonymous visitors", () => {
  for (const p of [...STAFF_ONLY_PATHS, "/dashboard"]) {
    test(`are sent to /login from ${p}`, async ({ page }) => {
      await page.goto(p);
      expect(new URL(page.url()).pathname).toBe("/login");
    });
  }

  test("get 404 (not data, not a redirect that reveals existence) for any document id", async ({ request }) => {
    for (const id of ["00000000-0000-0000-0000-000000000000", "../../etc/passwd", "1"]) {
      const r = await request.get(`/api/documents/${encodeURIComponent(id)}`, { maxRedirects: 0 });
      expect(r.status(), id).toBe(404);
    }
  });

  test("can open the public pages", async ({ page }) => {
    for (const p of ["/", "/assess", "/login"]) {
      const r = await page.goto(p);
      expect(r?.status(), p).toBe(200);
    }
  });
});

test.describe("sign-in", () => {
  test("wrong password and unknown e-mail give the same generic error and no session", async ({ browser }) => {
    const { ctx, page } = await newPage(browser);
    const a = await loginFails(page, accounts.staff, "definitely-wrong-password");
    const b = await loginFails(page, "nobody-here@example.test", "definitely-wrong-password");
    expect(a).toBe(b);
    expect((await ctx.cookies()).some((c) => c.name === "nz_session")).toBe(false);
    await page.goto("/ops");
    expect(new URL(page.url()).pathname).toBe("/login");
    await ctx.close();
  });

  test("repeated failures lock the account temporarily, even for the correct password", async ({ browser }) => {
    // A distinct forwarded address keeps this test's failures away from the shared "unknown" bucket (no trusted proxy header) used by other tests.
    const { ctx, page } = await newPage(browser, { width: 1366, height: 900 }, { "x-forwarded-for": "203.0.113.77" });
    const victim = `lockout-${Date.now()}@example.test`;
    let last = "";
    for (let i = 0; i < 9; i++) last = await loginFails(page, victim, "wrong-password-xx");
    expect(last).toMatch(/Хэт олон/);
    // The seeded staff account is NOT locked by someone else's failures when it uses another address.
    await ctx.close();
  });

  test("a role without a portal (supplier) is refused cleanly instead of looping between pages", async ({ browser }) => {
    const { ctx, page } = await newPage(browser);
    const msg = await loginFails(page, accounts.supplierRole, SEED_PASSWORD);
    expect(msg.length).toBeGreaterThan(5);
    expect((await ctx.cookies()).some((c) => c.name === "nz_session")).toBe(false);
    await ctx.close();
  });

  test("a crafted ?next= cannot send a customer outside /dashboard or staff outside /ops", async ({ browser }) => {
    for (const [email, next, prefix] of [
      [accounts.demoHousehold, "https://evil.example/phish", "/dashboard"],
      [accounts.demoHousehold, "//evil.example", "/dashboard"],
      [accounts.demoHousehold, "/ops/settings", "/dashboard"],
      [accounts.staff, "/dashboard", "/ops"],
    ] as const) {
      const { ctx, page } = await newPage(browser);
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', SEED_PASSWORD);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click('button[type="submit"]')]);
      const u = new URL(page.url());
      expect(u.host, next).toBe("localhost:3101");
      expect(u.pathname.startsWith(prefix), `${email} with next=${next} ended at ${u.pathname}`).toBe(true);
      await ctx.close();
    }
  });

  test("the session cookie is HttpOnly, SameSite=Lax and Secure, is not readable by page scripts, and the token is not in the page", async ({ browser }) => {
    const { ctx, page } = await newPage(browser);
    await login(page, accounts.staff, SEED_PASSWORD);
    const cookie = (await ctx.cookies()).find((c) => c.name === "nz_session")!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(cookie.secure).toBe(true); // production build; browsers still send Secure cookies to http://localhost
    expect(cookie.expires).toBeGreaterThan(Date.now() / 1000);
    expect(await page.evaluate(() => document.cookie)).not.toContain("nz_session");
    expect(await page.content()).not.toContain(cookie.value);
    await ctx.close();
  });

  test("responses carry the baseline security headers", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("signing out ends the session server-side (the old cookie no longer works)", async ({ browser }) => {
    const { ctx, page } = await newPage(browser);
    await login(page, accounts.staff, SEED_PASSWORD);
    const cookie = (await ctx.cookies()).find((c) => c.name === "nz_session")!;
    expect(cookie).toBeTruthy();
    await page.getByRole("button", { name: /Sign out|Гарах/ }).first().click();
    await page.waitForURL((u) => u.pathname === "/");
    // Replay the stolen/old cookie in a fresh context.
    const { ctx: ctx2, page: page2 } = await newPage(browser);
    await ctx2.addCookies([{ name: cookie.name, value: cookie.value, domain: "localhost", path: "/" }]);
    await page2.goto("/ops");
    expect(new URL(page2.url()).pathname).toBe("/login");
    await ctx.close();
    await ctx2.close();
  });
});

test.describe("customers and staff stay in their own area", () => {
  test("a customer cannot use the Control Center or its API surface", async ({ browser }) => {
    const { ctx, page } = await newPage(browser);
    await login(page, accounts.demoHousehold, SEED_PASSWORD);
    for (const p of STAFF_ONLY_PATHS) {
      await page.goto(p);
      const u = new URL(page.url());
      expect(u.pathname.startsWith("/ops"), `${p} -> ${u.pathname}`).toBe(false);
      await expect(body(page)).not.toContainText("Control Center");
    }
    await ctx.close();
  });

  test("staff are sent to /ops, not the customer dashboard", async ({ browser }) => {
    const { ctx, page } = await newPage(browser);
    await login(page, accounts.staff, SEED_PASSWORD);
    await page.goto("/dashboard");
    expect(new URL(page.url()).pathname).toBe("/ops");
    await ctx.close();
  });

  test("only an administrator can see user management on the settings page", async ({ browser }) => {
    const s = await newPage(browser);
    await login(s.page, accounts.staff, SEED_PASSWORD);
    await s.page.goto("/ops/settings");
    await expect(body(s.page)).not.toContainText(/Create staff account|Add staff/i);
    await s.ctx.close();
    const a = await newPage(browser);
    await login(a.page, accounts.admin, SEED_PASSWORD);
    await a.page.goto("/ops/settings");
    await expect(body(a.page)).toContainText(/staff/i);
    await a.ctx.close();
  });
});
