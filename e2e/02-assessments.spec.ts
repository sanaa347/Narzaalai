import { expect, test, type Page } from "@playwright/test";
import {
  CUSTOMER_PASSWORD, accounts, body, fillObjectivesStep, fillSiteStep, fillUsageStep, login, newPage, startWizard, submitAssessment,
  uniqueEmail, SEED_PASSWORD,
} from "./helpers";

const MOBILE = { width: 390, height: 844 };
const next = (page: Page) => page.getByRole("button", { name: "Үргэлжлүүлэх" }).click();
const summary = (page: Page) => page.getByText("Доорх талбаруудыг засна уу");

test.describe("household assessment", () => {
  test("a household can submit on a phone, gets a reference, and staff can find it in the inbox", async ({ browser }) => {
    const { ctx, page } = await newPage(browser, MOBILE);
    const email = uniqueEmail("household");
    const { reference, projectId } = await submitAssessment(page, { type: "household", email, monthlyKwh: "420" });
    expect(reference).toMatch(/^NZ-\d{4}-\d{6}$/);

    // Customer sees their own request, labelled as a preliminary estimate with a calculation version, and no money claims.
    await expect(body(page)).toContainText(reference);
    await expect(body(page)).toContainText(/prelim-sizing-\d+\.\d+\.\d+/);
    await expect(body(page)).toContainText(/урьдчилсан/i);
    await expect(body(page)).not.toContainText(/payback|өөрийгөө нөхөх хугацаа/i);

    // The same project is visible to staff in the inbox and by search.
    const staff = await newPage(browser);
    await login(staff.page, accounts.staff, SEED_PASSWORD);
    await staff.page.goto("/ops/inbox");
    await expect(body(staff.page)).toContainText(reference);
    await staff.page.goto(`/ops/projects/${projectId}`);
    await expect(body(staff.page)).toContainText(reference);
    await expect(body(staff.page)).toContainText("Household");
    await staff.ctx.close();
    await ctx.close();
  });

  test("'I don't know' is accepted, the gap is recorded for staff, and no usage figure is invented", async ({ browser }) => {
    const { ctx, page } = await newPage(browser, MOBILE);
    const { projectId } = await submitAssessment(page, { type: "household", email: uniqueEmail("unknown"), usageUnknown: true });
    // No kWp/kWh numbers may be shown when there is no usage data.
    const text = await body(page).innerText();
    expect(text).not.toMatch(/\d[\d.,]*\s*(кВп|kWp)/i);

    const staff = await newPage(browser);
    await login(staff.page, accounts.staff, SEED_PASSWORD);
    await staff.page.goto(`/ops/projects/${projectId}`);
    await expect(body(staff.page)).toContainText(/Missing|missing/);
    await staff.ctx.close();
    await ctx.close();
  });
});

test.describe("business assessment", () => {
  test("business-only fields are required before the business can continue", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await startWizard(page, "business");
    await fillSiteStep(page, { type: "business", email: uniqueEmail("biz-required") });
    await next(page);
    // Usage filled, but none of the business fields:
    await page.fill('input[name="monthlyKwh"]', "900");
    await page.locator('select[name="backupNeeded"]').selectOption({ index: 1 });
    await next(page);
    await expect(summary(page)).toBeVisible();
    await expect(body(page)).toContainText("Байгууллагын нэр");
    await expect(page.getByRole("heading", { name: /3\/5/ })).toBeVisible(); // still on step 3
  });

  test("a business with all required fields submits and staff see it as a business with its extra data", async ({ browser }) => {
    const { ctx, page } = await newPage(browser, MOBILE);
    const { reference, projectId } = await submitAssessment(page, { type: "business", email: uniqueEmail("biz"), monthlyKwh: "1500" });
    await expect(body(page)).toContainText(reference);

    const staff = await newPage(browser);
    await login(staff.page, accounts.staff, SEED_PASSWORD);
    await staff.page.goto(`/ops/projects/${projectId}`);
    await expect(body(staff.page)).toContainText("Business");
    await expect(body(staff.page)).toContainText("Тест ХХК (e2e)");
    await staff.ctx.close();
    await ctx.close();
  });
});

test.describe("validation failures (nothing is saved)", () => {
  test("step 2 rejects empty required fields and a malformed e-mail", async ({ page }) => {
    await startWizard(page, "household");
    await next(page);
    await expect(summary(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: /2\/5/ })).toBeVisible();

    await fillSiteStep(page, { type: "household", email: "not-an-email" });
    await next(page);
    await expect(body(page)).toContainText("Имэйл хаяг буруу байна");
    await expect(page.getByRole("heading", { name: /2\/5/ })).toBeVisible();
  });

  test("usage step rejects: nothing entered, negative kWh, a bill without its period", async ({ page }) => {
    await startWizard(page, "household");
    await fillSiteStep(page, { type: "household", email: uniqueEmail("val") });
    await next(page);

    await page.locator('select[name="backupNeeded"]').selectOption({ index: 1 });
    await next(page);
    await expect(body(page)).toContainText("Сарын хэрэглээ эсвэл төлбөрөө оруулна уу");

    await page.fill('input[name="monthlyKwh"]', "-5");
    await next(page);
    await expect(body(page)).toContainText(/кВт·ц буруу/);

    await page.fill('input[name="monthlyKwh"]', "");
    await page.fill('input[name="billAmount"]', "150000");
    await next(page);
    await expect(body(page)).toContainText("Төлбөрийн хугацааг");
    await expect(page.getByRole("heading", { name: /3\/5/ })).toBeVisible();
  });

  test("objectives step needs a goal and a timeframe; budget range must be consistent", async ({ page }) => {
    await startWizard(page, "household");
    await fillSiteStep(page, { type: "household", email: uniqueEmail("val2") });
    await next(page);
    await fillUsageStep(page, { type: "household", email: "x@example.test" });
    await next(page);
    await next(page);
    await expect(body(page)).toContainText("Дор хаяж нэг зорилт сонгоно уу");
    await page.locator('input[type="checkbox"]').first().check();
    await page.locator('select[name="timeframe"]').selectOption({ index: 1 });
    await page.fill('input[name="budgetMin"]', "9000000");
    await page.fill('input[name="budgetMax"]', "1000000");
    await next(page);
    await expect(body(page)).toContainText("Дээд төсөв нь доод төсвөөс бага байж болохгүй");
  });

  test("the final step needs a long-enough password and consent", async ({ page }) => {
    await startWizard(page, "household");
    await fillSiteStep(page, { type: "household", email: uniqueEmail("val3") });
    await next(page);
    await fillUsageStep(page, { type: "household", email: "x@example.test" });
    await next(page);
    await fillObjectivesStep(page);
    await next(page);

    await page.locator('input[type="password"]').fill("short");
    await page.getByRole("button", { name: "Хүсэлт илгээх" }).click();
    await expect(body(page)).toContainText("дор хаяж 8 тэмдэгт");
    await expect(body(page)).toContainText("Мэдээллээ боловсруулахыг зөвшөөрнө үү");
    expect(new URL(page.url()).pathname).toBe("/assess");
  });

  test("an e-mail that already has an account is refused with a clear message", async ({ browser }) => {
    const email = uniqueEmail("dupe");
    const a = await newPage(browser, MOBILE);
    await submitAssessment(a.page, { type: "household", email });
    await a.ctx.close();

    const b = await newPage(browser, MOBILE);
    await startWizard(b.page, "household");
    await fillSiteStep(b.page, { type: "household", email });
    await next(b.page);
    await fillUsageStep(b.page, { type: "household", email });
    await next(b.page);
    await fillObjectivesStep(b.page);
    await next(b.page);
    await b.page.locator('input[type="password"]').fill(CUSTOMER_PASSWORD);
    await b.page.locator('input[type="checkbox"]').last().check();
    await b.page.getByRole("button", { name: "Хүсэлт илгээх" }).click();
    await expect(b.page.getByText("Энэ имэйл бүртгэлтэй").first()).toBeVisible();
    expect(new URL(b.page.url()).pathname).toBe("/assess");
    await b.ctx.close();
  });
});

test.describe("draft handling", () => {
  test("a half-filled wizard is restored after reload, and the password is never stored in the browser", async ({ page }) => {
    await startWizard(page, "household");
    await fillSiteStep(page, { type: "household", email: uniqueEmail("draft") });
    await next(page);
    await fillUsageStep(page, { type: "household", email: "x@example.test" });
    await next(page);
    await fillObjectivesStep(page);
    await next(page);
    const secret = "do-not-store-this-pw-1";
    await page.locator('input[type="password"]').fill(secret);

    const stored = await page.evaluate(() => Object.values(window.localStorage).join("\n"));
    expect(stored).not.toContain(secret);
    expect(stored).toContain("Төв аймаг"); // the draft itself does persist

    await page.reload();
    await expect(page.getByText("Өмнө бөглөсөн ноорог сэргээгдлээ")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveValue("");
  });
});

test.describe("signed-in customers", () => {
  test("see only their own projects on the dashboard", async ({ browser }) => {
    const a = await newPage(browser, MOBILE);
    const idA = (await submitAssessment(a.page, { type: "household", email: uniqueEmail("own-a") })).projectId;
    const b = await newPage(browser, MOBILE);
    const idB = (await submitAssessment(b.page, { type: "household", email: uniqueEmail("own-b") })).projectId;
    await a.page.goto("/dashboard");
    const hrefs = await a.page.locator('a[href^="/dashboard/projects/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs).toContain(`/dashboard/projects/${idA}`);
    expect(hrefs).not.toContain(`/dashboard/projects/${idB}`);
    expect(new Set(hrefs).size).toBe(1);
    await a.ctx.close();
    await b.ctx.close();
  });
});
