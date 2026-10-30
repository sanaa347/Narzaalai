import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { accounts, body, login, newPage, pdfBytes, SEED_PASSWORD, submitAssessment, uniqueEmail } from "./helpers";
import { documentHref, forceValue, outcome, projectStatus, uploadStaffDocument } from "./ops-helpers";

test.describe.configure({ mode: "serial" });

const MOBILE = { width: 390, height: 844 };
let staffCtx: BrowserContext, aCtx: BrowserContext, bCtx: BrowserContext;
let staff: Page, a: Page, b: Page;
let projA = "", projB = "", refA = "";
let hrefStaffOnly = "", hrefShared = "", hrefMine = "";

const status = async (req: APIRequestContext, href: string) => (await req.get(href, { maxRedirects: 0 })).status();

test.beforeAll(async ({ browser }) => {
  const s = await newPage(browser);
  staffCtx = s.ctx; staff = s.page;
  await login(staff, accounts.staff, SEED_PASSWORD);
  const ca = await newPage(browser, MOBILE);
  aCtx = ca.ctx; a = ca.page;
  ({ projectId: projA, reference: refA } = await submitAssessment(a, { type: "household", email: uniqueEmail("doc-a"), monthlyKwh: "400" }));
  const cb = await newPage(browser, MOBILE);
  bCtx = cb.ctx; b = cb.page;
  ({ projectId: projB } = await submitAssessment(b, { type: "business", email: uniqueEmail("doc-b"), monthlyKwh: "1200" }));
});
test.afterAll(async () => { await staffCtx?.close(); await aCtx?.close(); await bCtx?.close(); });

test.describe("who can download which document", () => {
  test("setup: one staff-only file, one file shared with customer A, one file uploaded by customer A", async () => {
    expect((await uploadStaffDocument(staff, projA, "Other", "staff-only-note.pdf", pdfBytes("staff only"))).ok).toBe(true);
    expect((await uploadStaffDocument(staff, projA, "Quotation", "shared-with-a.pdf", pdfBytes("shared"), { customerVisible: true })).ok).toBe(true);

    await a.goto(`/dashboard/projects/${projA}`);
    const form = a.locator('form:has(input[type="file"])');
    await form.locator('input[name="file"]').setInputFiles({ name: "customer-a-bill.pdf", mimeType: "application/pdf", buffer: pdfBytes("a bill") });
    await form.getByRole("button", { name: "Файл оруулах" }).click();
    expect((await outcome(form)).ok).toBe(true);

    hrefStaffOnly = await documentHref(staff, projA, "staff-only-note.pdf");
    hrefShared = await documentHref(staff, projA, "shared-with-a.pdf");
    hrefMine = await documentHref(staff, projA, "customer-a-bill.pdf");
  });

  test("the owning customer gets their own and shared files — with safe headers — but a staff-only file is a 404", async () => {
    expect(await status(a.request, hrefStaffOnly)).toBe(404);
    const shared = await a.request.get(hrefShared);
    expect(shared.status()).toBe(200);
    expect(shared.headers()["content-type"]).toBe("application/pdf");
    expect(shared.headers()["x-content-type-options"]).toBe("nosniff");
    expect(shared.headers()["content-security-policy"]).toContain("sandbox");
    expect(shared.headers()["cache-control"]).toMatch(/no-store/);
    expect((await shared.body()).subarray(0, 4).toString()).toBe("%PDF");
    expect(await status(a.request, hrefMine)).toBe(200);

    await a.goto(`/dashboard/projects/${projA}`);
    await expect(body(a)).toContainText("shared-with-a.pdf");
    await expect(body(a)).toContainText("customer-a-bill.pdf");
    await expect(body(a)).not.toContainText("staff-only-note.pdf");
  });

  test("a different customer gets 404 for every one of those files, and cannot open the project page", async () => {
    for (const href of [hrefStaffOnly, hrefShared, hrefMine]) expect(await status(b.request, href), href).toBe(404);
    expect((await b.goto(`/dashboard/projects/${projA}`))?.status()).toBe(404);
    expect((await a.goto(`/dashboard/projects/${projB}`))?.status()).toBe(404);
  });

  test("an anonymous visitor and a made-up session cookie get 404 for every file", async ({ browser }) => {
    const anon = await browser.newContext();
    for (const href of [hrefStaffOnly, hrefShared, hrefMine]) expect(await status(anon.request, href), href).toBe(404);
    await anon.addCookies([{ name: "nz_session", value: "0".repeat(64), domain: "localhost", path: "/" }]);
    for (const href of [hrefStaffOnly, hrefShared, hrefMine]) expect(await status(anon.request, href), `forged cookie ${href}`).toBe(404);
    await anon.close();
  });

  test("staff can open all of them", async () => {
    for (const href of [hrefStaffOnly, hrefShared, hrefMine]) expect(await status(staff.request, href), href).toBe(200);
  });

  test("sharing and hiding is enforced immediately on the server", async () => {
    await staff.goto(`/ops/projects/${projA}`);
    await staff.locator("tr", { hasText: "staff-only-note.pdf" }).getByRole("button", { name: "Share" }).click();
    await expect(staff.locator("tr", { hasText: "staff-only-note.pdf" })).toContainText("Visible to customer");
    expect(await status(a.request, hrefStaffOnly)).toBe(200);
    expect(await status(b.request, hrefStaffOnly)).toBe(404);

    await staff.locator("tr", { hasText: "staff-only-note.pdf" }).getByRole("button", { name: "Hide" }).click();
    await expect(staff.locator("tr", { hasText: "staff-only-note.pdf" })).toContainText("Staff only");
    expect(await status(a.request, hrefStaffOnly)).toBe(404);
  });
});

test.describe("upload validation and abuse", () => {
  const upload = async (page: Page, projectId: string, f: { name: string; mimeType: string; buffer: Buffer }) => {
    await page.goto(`/dashboard/projects/${projectId}`);
    const form = page.locator('form:has(input[type="file"])');
    await form.locator('input[name="file"]').setInputFiles(f);
    await form.getByRole("button", { name: "Файл оруулах" }).click();
    return outcome(form);
  };

  test("executables, HTML/SVG and unknown extensions are refused", async () => {
    for (const f of [
      { name: "run.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ\x90\x00 fake") },
      { name: "page.html", mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") },
      { name: "pic.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg onload=alert(1)/>") },
      { name: "noext", mimeType: "application/pdf", buffer: pdfBytes("noext") },
    ]) {
      const out = await upload(a, projA, f);
      expect(out.ok, f.name).toBe(false);
    }
    await staff.goto(`/ops/projects/${projA}`);
    for (const n of ["run.exe", "page.html", "pic.svg", "noext"]) await expect(body(staff)).not.toContainText(n);
  });

  test("a file whose content does not match its extension is refused (an HTML page renamed .pdf / .png)", async () => {
    expect((await upload(a, projA, { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html><script>1</script></html>") })).ok).toBe(false);
    expect((await upload(a, projA, { name: "fake.png", mimeType: "image/png", buffer: pdfBytes("not a png") })).ok).toBe(false);
  });

  test("a file over 10 MB is refused", async () => {
    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(10 * 1024 * 1024 + 1, 0x20)]);
    const out = await upload(a, projA, { name: "huge.pdf", mimeType: "application/pdf", buffer: big });
    expect(out.ok).toBe(false);
    expect(out.text).toMatch(/10/);
  });

  test("a customer cannot attach a file to someone else's project by forging the hidden project id", async () => {
    await b.goto(`/dashboard/projects/${projB}`);
    const form = b.locator('form:has(input[type="file"])');
    await forceValue(form.locator('input[name="projectId"]'), projA);
    await form.locator('input[name="file"]').setInputFiles({ name: "intruder.pdf", mimeType: "application/pdf", buffer: pdfBytes("intruder") });
    await form.getByRole("button", { name: "Файл оруулах" }).click();
    const out = await outcome(form);
    expect(out.ok).toBe(false);
    await staff.goto(`/ops/projects/${projA}`);
    await expect(body(staff)).not.toContainText("intruder.pdf");
    await staff.goto(`/ops/projects/${projB}`);
    await expect(body(staff)).not.toContainText("intruder.pdf");
  });

  test("a customer cannot change a document's visibility or status: those controls are staff-only server actions", async () => {
    // The customer pages contain no such forms; and the staff pages are not reachable.
    await a.goto(`/dashboard/projects/${projA}`);
    await expect(a.locator('input[name="access"]')).toHaveCount(0);
    await expect(a.locator('select[name="to"]')).toHaveCount(0);
    expect((await a.goto(`/ops/projects/${projA}`))?.url()).not.toContain("/ops/projects/");
  });
});

test.describe("internal notes and missing-information requests", () => {
  const SECRET = "INTERNAL-ONLY-e2e-marker-7391";

  test("an internal note is visible to staff and never to the customer", async () => {
    await staff.goto(`/ops/projects/${projA}`);
    const form = staff.locator('form:has(textarea[name="body"])');
    await form.locator('textarea[name="body"]').fill(`${SECRET} customer sounds hesitant`);
    await form.getByRole("button", { name: "Add note" }).click();
    expect((await outcome(form)).ok).toBe(true);
    await staff.reload();
    await expect(body(staff)).toContainText(SECRET);
    await a.goto(`/dashboard/projects/${projA}`);
    await expect(body(a)).not.toContainText(SECRET);
    await a.reload();
    await expect(body(a)).not.toContainText("hesitant");
  });

  test("staff request missing information; the project goes to NEEDS_INFO; the customer answers; it returns to ASSESSMENT", async () => {
    await staff.goto(`/ops/projects/${projA}`);
    const form = staff.locator('form:has(textarea[name="message"])');
    await form.locator('textarea[name="message"]').fill("Please send a photo of the roof (e2e).");
    await form.getByRole("button", { name: "Request information" }).click();
    expect((await outcome(form)).ok).toBe(true);
    expect(await projectStatus(staff, projA)).toBe("NEEDS_INFO");

    await a.goto(`/dashboard/projects/${projA}`);
    await expect(body(a)).toContainText("Please send a photo of the roof (e2e).");
    const ans = a.locator('form:has(textarea[name="response"])');
    await ans.locator('textarea[name="response"]').fill("Roof photo uploaded, south-facing (e2e).");
    await ans.getByRole("button", { name: "Хариулах" }).click();
    // The answered question leaves the "open" list, so its form (and success message) disappears: assert on the resulting state.
    await expect(a.locator('textarea[name="response"]')).toHaveCount(0);
    await expect(async () => { expect(await projectStatus(staff, projA)).toBe("ASSESSMENT"); }).toPass({ timeout: 15_000 });
    await expect(body(staff)).toContainText("Roof photo uploaded, south-facing (e2e).");
  });

  test("another customer cannot answer a request that is not theirs (forged request id)", async () => {
    await staff.goto(`/ops/projects/${projA}`);
    const form = staff.locator('form:has(textarea[name="message"])');
    await form.locator('textarea[name="message"]').fill("Second question for A (e2e).");
    await form.getByRole("button", { name: "Request information" }).click();
    expect((await outcome(form)).ok).toBe(true);
    const requestId = await a.goto(`/dashboard/projects/${projA}`).then(() => a.locator('input[name="infoRequestId"]').first().inputValue());

    // B needs a request of their own to get a form to forge.
    await staff.goto(`/ops/projects/${projB}`);
    const fb = staff.locator('form:has(textarea[name="message"])');
    await fb.locator('textarea[name="message"]').fill("Question for B (e2e).");
    await fb.getByRole("button", { name: "Request information" }).click();
    expect((await outcome(fb)).ok).toBe(true);

    await b.goto(`/dashboard/projects/${projB}`);
    const bForm = b.locator('form:has(textarea[name="response"])');
    await forceValue(bForm.locator('input[name="infoRequestId"]'), requestId);
    await bForm.locator('textarea[name="response"]').fill("I am B answering A's question");
    await bForm.getByRole("button", { name: "Хариулах" }).click();
    expect((await outcome(bForm)).ok).toBe(false);
    await staff.goto(`/ops/projects/${projA}`);
    await expect(body(staff)).not.toContainText("I am B answering");
  });

  test("the staff inbox finds the project by its reference number (the default chip only lists new requests)", async () => {
    // By now the project is IN ASSESSMENT, so the default "Submitted (new)" chip correctly does not list it.
    await staff.goto("/ops/inbox");
    await expect(body(staff)).not.toContainText(refA);
    await staff.goto(`/ops/inbox?status=OPEN&q=${encodeURIComponent(refA)}`);
    await expect(body(staff)).toContainText(refA);
  });
});
