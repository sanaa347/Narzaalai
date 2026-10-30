import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/domain/errors";
import { calculatePrelim, type PrelimInput } from "@/lib/solar/prelim";
import { submitAssessment } from "@/lib/services/assessment";
import { getProjectBundle, getProjectForActor, listCustomerProjects, listOpsProjects, opsOverview } from "@/lib/services/projects";
import { addInternalNote, answerInfoRequest, assignOwner, changeStatus, recordMilestone, requestInfo, setVerificationState, updateSchedule } from "@/lib/services/workflow";
import { createSupplier, setSupplierArchived } from "@/lib/services/suppliers";
import { createProduct } from "@/lib/services/products";
import { createQuote, getComparisonInputs, updateQuote } from "@/lib/services/quotes";
import { approveProposal, createProposalDraft, listProposalsForCustomer, publishProposal, withdrawProposal } from "@/lib/services/proposals";
import { getDocumentForDownload, saveDocument } from "@/lib/services/documents";
import { addAsset, addWarranty, createServiceTicket } from "@/lib/services/assets";
import { createStaffUser, setUserStatus } from "@/lib/services/users";
import { authenticate } from "@/lib/auth/session";
import { businessPayload, day, householdPayload, makeCustomer, makeDb, makeStaff } from "./helpers";

let db: Db;
beforeEach(() => { db = makeDb(); });

const err = (fn: () => unknown): DomainError => {
  try { fn(); } catch (e) { if (e instanceof DomainError) return e; throw e; }
  throw new Error("expected DomainError");
};
const pdf = (name = "doc.pdf") => ({ name, mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.4\n%test\n") });

function supplier(staff: ReturnType<typeof makeStaff>, name = "Real Supplier LLC") {
  return createSupplier(db, staff, { companyName: name });
}
function quote(staff: ReturnType<typeof makeStaff>, supplierId: string, projectId: string, over: Record<string, unknown> = {}) {
  return createQuote(db, staff, {
    supplierId, projectId, reference: `Q-${Math.random().toString(36).slice(2, 8)}`, quoteDate: day(-2), receivedOn: day(-1), validUntil: day(20), currency: "MNT",
    sourceType: "supplier_quotation", sourceNote: "email from sales, quote.pdf", pvKwp: "5", lines: [{ category: "pv_module", description: "Panel", quantity: 10, unitPrice: "400000" }],
    installation: "1000000", ...over,
  });
}
function toQuoteRequested(staff: ReturnType<typeof makeStaff>, projectId: string) {
  changeStatus(db, staff, projectId, { to: "ASSESSMENT" });
  changeStatus(db, staff, projectId, { to: "QUOTE_REQUESTED" });
}

describe("assessment submission (customer workflow)", () => {
  it("saves a household request with reference, org, site, energy profile, assessment, project and first event", () => {
    const c = makeCustomer(db);
    expect(c.reference).toMatch(/^NZ-\d{4}-\d{6}$/);
    const proj = db.prepare("SELECT * FROM projects WHERE id = ?").get(c.projectId) as { status: string; reference: string; org_id: string };
    expect(proj.status).toBe("SUBMITTED");
    expect(proj.reference).toBe(c.reference.replace("NZ-", "PRJ-"));
    expect(db.prepare("SELECT organization_type FROM organizations WHERE id = ?").get(proj.org_id)).toEqual({ organization_type: "household" });
    expect(db.prepare("SELECT COUNT(*) AS n FROM project_events WHERE project_id = ? AND event_type = 'SUBMITTED'").get(c.projectId)).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM sites").get()).toEqual({ n: 1 });
  });
  it("saves a business request with its additional fields", () => {
    const c = makeCustomer(db, businessPayload({ businessSeasonalPattern: "Зун ачаалал өндөр", additionalSitesNote: "2 салбар" }));
    const org = db.prepare("SELECT o.name, o.organization_type FROM organizations o JOIN projects p ON p.org_id = o.id WHERE p.id = ?").get(c.projectId) as { name: string; organization_type: string };
    expect(org).toEqual({ name: "Тест ХХК", organization_type: "business" });
    const e = db.prepare("SELECT business_category, business_seasonal_pattern, additional_sites_note FROM energy_profiles").get() as Record<string, string>;
    expect(e.business_seasonal_pattern).toBe("Зун ачаалал өндөр");
  });
  it("assigns unique, sequential references", () => {
    const a = makeCustomer(db), b = makeCustomer(db);
    expect(a.reference).not.toBe(b.reference);
  });
  it("rejects invalid input server-side with field errors and saves nothing", () => {
    const e = err(() => submitAssessment(db, householdPayload({ province: "", consent: false }), { fullName: "X", phone: "+976 99112233", email: "x@test.test", password: "longenoughpass" }, null));
    expect(e.fieldErrors).toMatchObject({ province: expect.any(String), consent: expect.any(String) });
    expect(db.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM organizations").get()).toEqual({ n: 0 });
  });
  it("is atomic: a duplicate email aborts without partial records", () => {
    makeCustomer(db);
    const before = db.prepare("SELECT (SELECT COUNT(*) FROM sites) s, (SELECT COUNT(*) FROM projects) p").get();
    const first = db.prepare("SELECT email FROM users").get() as { email: string };
    const e = err(() => submitAssessment(db, householdPayload(), { fullName: "Dup", phone: "+976 99112233", email: first.email, password: "longenoughpass" }, null));
    expect(e.code).toBe("conflict");
    expect(db.prepare("SELECT (SELECT COUNT(*) FROM sites) s, (SELECT COUNT(*) FROM projects) p").get()).toEqual(before);
  });
  it("a logged-in customer can submit again and reuses their organization", () => {
    const c = makeCustomer(db);
    const second = submitAssessment(db, householdPayload({ province: "Дархан" }), null, c.actor);
    expect(second.createdAccount).toBe(false);
    expect(db.prepare("SELECT COUNT(*) AS n FROM organizations").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM projects").get()).toEqual({ n: 2 });
  });
  it("staff cannot submit through the customer flow", () => {
    expect(err(() => submitAssessment(db, householdPayload(), null, makeStaff(db))).code).toBe("forbidden");
  });
  it("stores a reproducible calculation: recomputing from the stored snapshot gives the stored result", () => {
    const c = makeCustomer(db, householdPayload({ monthlyKwh: "512", installAreaM2: "30", backupNeeded: "yes", criticalLoads: "fridge" }));
    const a = db.prepare("SELECT calc_version, input_snapshot, results, missing_data FROM assessments WHERE id = ?").get(c.assessmentId) as Record<string, string>;
    expect(calculatePrelim(JSON.parse(a.input_snapshot) as PrelimInput)).toEqual(JSON.parse(a.results));
    expect(a.calc_version).toBe(JSON.parse(a.results).version);
    expect(JSON.parse(a.missing_data)).toEqual(expect.arrayContaining(["coordinates", "shading"]));
  });
  it("persists across a reopened connection (data survives reload)", () => {
    const c = makeCustomer(db);
    expect(db.prepare("SELECT reference FROM assessments WHERE id = ?").get(c.assessmentId)).toEqual({ reference: c.reference });
  });
  it("records provenance: unknown vs customer-provided", () => {
    const c = makeCustomer(db, householdPayload({ monthlyKwh: "" , usageUnknown: true }));
    const p = JSON.parse((db.prepare("SELECT provenance FROM energy_profiles").get() as { provenance: string }).provenance);
    expect(p.monthly_kwh).toBe("unknown");
    expect(p.major_loads).toBe("unknown");
    expect(c.assessmentId).toBeTruthy();
  });
});

describe("customer data isolation", () => {
  it("customer B cannot read customer A's project, bundle, list entries, documents, or answer/approve for them", () => {
    const staff = makeStaff(db);
    const a = makeCustomer(db), b = makeCustomer(db);
    expect(getProjectForActor(db, b.actor, a.projectId)).toBeNull();
    expect(getProjectBundle(db, b.actor, a.projectId)).toBeNull();
    expect(listCustomerProjects(db, b.actor).map((p) => p.id)).toEqual([b.projectId]);
    expect(getProjectBundle(db, a.actor, a.projectId)).not.toBeNull();

    requestInfo(db, staff, a.projectId, "Send your bill");
    const ir = db.prepare("SELECT id FROM info_requests").get() as { id: string };
    expect(err(() => answerInfoRequest(db, b.actor, ir.id, "hacked")).code).toBe("not_found");
    expect(db.prepare("SELECT status FROM info_requests WHERE id = ?").get(ir.id)).toEqual({ status: "open" });

    const doc = saveDocument(db, a.actor, { name: "bill.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.4 a") }, { projectId: a.projectId, docType: "utility_bill" });
    expect(getDocumentForDownload(db, a.actor, doc.id)).not.toBeNull();
    expect(getDocumentForDownload(db, b.actor, doc.id)).toBeNull();
    expect(getDocumentForDownload(db, null, doc.id)).toBeNull();
    expect(err(() => saveDocument(db, b.actor, pdf(), { projectId: a.projectId, docType: "other" })).code).toBe("not_found");
    expect(err(() => createServiceTicket(db, b.actor, a.projectId, { description: "x" })).code).toBe("not_found");
  });
  it("customers never receive internal notes, internal events, staff-only documents or raw quotations", () => {
    const staff = makeStaff(db);
    const a = makeCustomer(db);
    addInternalNote(db, staff, a.assessmentId, "internal: customer is difficult");
    assignOwner(db, staff, a.projectId, staff.id);
    changeStatus(db, staff, a.projectId, { to: "ASSESSMENT", note: "internal reason text" });
    const internalDoc = saveDocument(db, staff, pdf("internal.pdf"), { projectId: a.projectId, docType: "other", customerVisible: false });
    const sharedDoc = saveDocument(db, staff, pdf("shared.pdf"), { projectId: a.projectId, docType: "proposal", customerVisible: true });
    const cust = getProjectBundle(db, a.actor, a.projectId)!;
    expect(cust.notes).toEqual([]);
    expect(cust.events.some((e) => e.event_type === "ASSIGNED")).toBe(false);
    expect(cust.events.every((e) => e.customer_visible === 1)).toBe(true);
    expect(cust.events.find((e) => e.new_status === "ASSESSMENT")?.note).toBeNull(); // staff note stays internal
    expect(cust.documents.map((d) => d.id)).toEqual([sharedDoc.id]);
    expect(getDocumentForDownload(db, a.actor, internalDoc.id)).toBeNull();
    expect(JSON.stringify(cust)).not.toContain("internal: customer is difficult");
    const staffView = getProjectBundle(db, staff, a.projectId)!;
    expect(staffView.notes).toHaveLength(1);
    expect(staffView.events.find((e) => e.new_status === "ASSESSMENT")?.note).toBe("internal reason text");
  });
  it("disabled users and customers have no operations capabilities", () => {
    const customer = makeCustomer(db);
    expect(err(() => changeStatus(db, customer.actor, customer.projectId, { to: "ASSESSMENT" })).code).toBe("forbidden");
    expect(err(() => createSupplier(db, customer.actor, { companyName: "X" })).code).toBe("forbidden");
    expect(err(() => addInternalNote(db, null, customer.assessmentId, "x")).code).toBe("forbidden");
    const staff = makeStaff(db);
    const admin = makeStaff(db, "admin");
    setUserStatus(db, admin, staff.id, "disabled");
    expect(authenticate(db, `${staff.id}@staff.test`, "correct-horse-battery")).toBeNull();
  });
});

describe("operations workflow", () => {
  it("staff can find new requests, filter, search and see attention flags", () => {
    const staff = makeStaff(db);
    const a = makeCustomer(db), b = makeCustomer(db, businessPayload());
    const all = listOpsProjects(db, staff);
    expect(all.total).toBe(2);
    expect(all.rows.every((r) => r.flags.includes("unassigned"))).toBe(true);
    expect(listOpsProjects(db, staff, { q: "Тест ХХК" }).rows.map((r) => r.id)).toEqual([b.projectId]);
    expect(listOpsProjects(db, staff, { q: a.reference }).rows.map((r) => r.id)).toEqual([a.projectId]);
    expect(listOpsProjects(db, staff, { status: "ASSESSMENT" }).total).toBe(0);
    assignOwner(db, staff, a.projectId, staff.id);
    expect(listOpsProjects(db, staff, { owner: "me" }).rows.map((r) => r.id)).toEqual([a.projectId]);
    expect(listOpsProjects(db, staff, { attention: "unassigned" }).rows.map((r) => r.id)).toEqual([b.projectId]);
    expect(opsOverview(db).total).toBe(2);
  });
  it("search treats % and _ literally (no wildcard injection)", () => {
    const staff = makeStaff(db);
    makeCustomer(db);
    expect(listOpsProjects(db, staff, { q: "%" }).total).toBe(0);
  });
  it("records every status change with previous/new status, actor, timestamp and note", () => {
    const staff = makeStaff(db, "staff", "Ops One");
    const c = makeCustomer(db);
    changeStatus(db, staff, c.projectId, { to: "ASSESSMENT", note: "starting review" });
    const ev = db.prepare("SELECT * FROM project_events WHERE event_type = 'STATUS_CHANGE'").get() as Record<string, string>;
    expect(ev).toMatchObject({ previous_status: "SUBMITTED", new_status: "ASSESSMENT", note: "starting review", actor_id: staff.id, actor_label: "Staff: Ops One" });
    expect(Date.parse(ev.created_at)).not.toBeNaN();
  });
  it("refuses invalid transitions and does not change status or write an event", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    const e = err(() => changeStatus(db, staff, c.projectId, { to: "INSTALLATION" }));
    expect(e.code).toBe("workflow");
    expect(db.prepare("SELECT status FROM projects WHERE id = ?").get(c.projectId)).toEqual({ status: "SUBMITTED" });
    expect(db.prepare("SELECT COUNT(*) AS n FROM project_events WHERE event_type = 'STATUS_CHANGE'").get()).toEqual({ n: 0 });
  });
  it("cannot set APPROVED through the generic status action", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    expect(err(() => changeStatus(db, staff, c.projectId, { to: "APPROVED", viaApprovalWorkflow: true })).code).toBe("workflow");
  });
  it("delay remembers where to resume; cancel requires a reason", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    toQuoteRequested(staff, c.projectId);
    changeStatus(db, staff, c.projectId, { to: "DELAYED", note: "waiting for stock" });
    expect((db.prepare("SELECT resume_status FROM projects WHERE id = ?").get(c.projectId) as { resume_status: string }).resume_status).toBe("QUOTE_REQUESTED");
    expect(err(() => changeStatus(db, staff, c.projectId, { to: "ASSESSMENT" })).code).toBe("workflow");
    changeStatus(db, staff, c.projectId, { to: "QUOTE_REQUESTED" });
    expect(err(() => changeStatus(db, staff, c.projectId, { to: "CANCELLED" })).code).toBe("workflow");
    changeStatus(db, staff, c.projectId, { to: "CANCELLED", note: "customer withdrew" });
  });
  it("info request moves the project to NEEDS_INFO; the customer's answer returns it to ASSESSMENT", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    changeStatus(db, staff, c.projectId, { to: "ASSESSMENT" });
    requestInfo(db, staff, c.projectId, "Please send the last 3 bills");
    expect((db.prepare("SELECT status FROM projects").get() as { status: string }).status).toBe("NEEDS_INFO");
    const ir = db.prepare("SELECT id FROM info_requests").get() as { id: string };
    answerInfoRequest(db, c.actor, ir.id, "Attached next");
    expect((db.prepare("SELECT status FROM projects").get() as { status: string }).status).toBe("ASSESSMENT");
    expect(err(() => answerInfoRequest(db, c.actor, ir.id, "again")).code).toBe("conflict");
    const events = db.prepare("SELECT actor_label, event_type FROM project_events WHERE event_type IN ('INFO_PROVIDED') ").all() as { actor_label: string }[];
    expect(events[0].actor_label).toMatch(/^Customer:/);
  });
  it("verification can only become 'verified' with a recorded basis; schedule dates are validated and never presented as a promise", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    expect(err(() => setVerificationState(db, staff, c.assessmentId, "verified", "")).message).toMatch(/verification/i);
    setVerificationState(db, staff, c.assessmentId, "awaiting_verification", "");
    expect(err(() => updateSchedule(db, staff, c.projectId, { scheduledInstallDate: "31-12-2026" })).message).toMatch(/invalid date/i);
    updateSchedule(db, staff, c.projectId, { scheduledInstallDate: day(30), blockedReason: "waiting for permit" });
    const ev = db.prepare("SELECT note, customer_visible FROM project_events WHERE event_type = 'MILESTONE'").get() as { note: string; customer_visible: number };
    expect(ev.customer_visible).toBe(1);
    expect(ev.note).toMatch(/баталгаат амлалт биш/);
    expect(listOpsProjects(db, staff, { attention: "blocked" }).total).toBe(1);
  });
  it("milestones can reference only this project's documents", () => {
    const staff = makeStaff(db);
    const a = makeCustomer(db), b = makeCustomer(db);
    const docB = saveDocument(db, staff, pdf(), { projectId: b.projectId, docType: "other" });
    expect(err(() => recordMilestone(db, staff, a.projectId, { title: "Site visit", documentId: docB.id })).code).toBe("invalid");
    recordMilestone(db, staff, a.projectId, { title: "Site visit", customerVisible: true });
  });
  it("assignment requires an active staff member", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    expect(err(() => assignOwner(db, staff, c.projectId, c.userId)).code).toBe("invalid");
  });
});

describe("suppliers, products and quotations", () => {
  it("a supplier is a 'verified' installer only with recorded evidence", () => {
    const staff = makeStaff(db);
    const e = err(() => createSupplier(db, staff, { companyName: "A", installerCapability: "verified" }));
    expect(e.fieldErrors).toHaveProperty("qualificationEvidence");
    const id = createSupplier(db, staff, { companyName: "B", installerCapability: "verified", qualificationEvidence: "Licence #123 issued by X, copy on file" });
    expect(db.prepare("SELECT verification_state FROM suppliers WHERE id = ?").get(id)).toEqual({ verification_state: "evidence_recorded" });
    const id2 = createSupplier(db, staff, { companyName: "C", installerCapability: "claimed" });
    expect(db.prepare("SELECT verification_state FROM suppliers WHERE id = ?").get(id2)).toEqual({ verification_state: "unverified" });
  });
  it("archive is a soft delete and duplicates are refused", () => {
    const staff = makeStaff(db);
    const id = supplier(staff);
    expect(err(() => supplier(staff)).code).toBe("conflict");
    setSupplierArchived(db, staff, id, true);
    expect(db.prepare("SELECT archived_at, status FROM suppliers WHERE id = ?").get(id)).toMatchObject({ status: "inactive" });
    expect((db.prepare("SELECT archived_at FROM suppliers WHERE id = ?").get(id) as { archived_at: string }).archived_at).toBeTruthy();
  });
  it("a product price must carry its source and check date", () => {
    const staff = makeStaff(db);
    const e = err(() => createProduct(db, staff, { category: "pv_module", manufacturer: "M", model: "X1", price: "100000" }));
    expect(e.fieldErrors).toMatchObject({ source: expect.any(String), lastCheckedOn: expect.any(String) });
    createProduct(db, staff, { category: "pv_module", manufacturer: "M", model: "X1", price: "100000", source: "price list PDF", lastCheckedOn: day(0) });
    createProduct(db, staff, { category: "pv_module", manufacturer: "M", model: "no-price" });
  });
  it("computes quote totals server-side from integer minor units and stores line items", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    const s = supplier(staff);
    const id = quote(staff, s, c.projectId, {
      currency: "USD", lines: [{ category: "pv_module", description: "Panel", quantity: "10", unitPrice: "125.50" }, { category: "inverter", description: "Inv", quantity: 1, unitPrice: "1,200.00" }],
      installation: "700.00", delivery: "150.25", taxes: "10", total: "1", // client-supplied total is ignored
    });
    const q = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as Record<string, number | string>;
    expect(q.equipment_subtotal_minor).toBe(10 * 12550 + 120000);
    expect(q.total_minor).toBe(10 * 12550 + 120000 + 70000 + 15025 + 1000);
    expect(q.currency).toBe("USD");
    expect(db.prepare("SELECT COUNT(*) AS n FROM quote_line_items WHERE quote_id = ?").get(id)).toEqual({ n: 2 });
    const lines = db.prepare("SELECT line_total_minor FROM quote_line_items WHERE quote_id = ? ORDER BY position").all(id) as { line_total_minor: number }[];
    expect(lines.map((l) => l.line_total_minor)).toEqual([125500, 120000]);
  });
  it("rejects bad amounts, missing line items, and fractions of MNT", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    const s = supplier(staff);
    expect(err(() => quote(staff, s, c.projectId, { lines: [] })).fieldErrors).toHaveProperty("lines");
    expect(err(() => quote(staff, s, c.projectId, { lines: [{ description: "x", quantity: 1, unitPrice: "100.5" }] })).fieldErrors).toHaveProperty("lines.0.unitPrice");
    expect(err(() => quote(staff, s, c.projectId, { installation: "abc" })).fieldErrors).toHaveProperty("installation");
    expect(err(() => quote(staff, s, c.projectId, { validUntil: day(-10) })).fieldErrors).toHaveProperty("validUntil");
  });
  it("a real supplier quotation must record when/how it was received; demo and real sources cannot be mixed", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    const real = supplier(staff, "Real Co");
    expect(err(() => quote(staff, real, c.projectId, { receivedOn: undefined, sourceNote: undefined })).fieldErrors).toMatchObject({ receivedOn: expect.any(String), sourceNote: expect.any(String) });
    expect(err(() => quote(staff, real, c.projectId, { sourceType: "demo" })).fieldErrors).toHaveProperty("sourceType");
    const demo = supplier(staff, "ДЕМО Co");
    db.prepare("UPDATE suppliers SET is_demo = 1 WHERE id = ?").run(demo);
    expect(err(() => quote(staff, demo, c.projectId, { sourceType: "supplier_quotation" })).fieldErrors).toHaveProperty("sourceType");
    quote(staff, demo, c.projectId, { sourceType: "demo", receivedOn: undefined, sourceNote: undefined });
  });
  it("enforces one reference per supplier and blocks quoting on closed or archived targets", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    const s = supplier(staff);
    quote(staff, s, c.projectId, { reference: "X-1" });
    expect(err(() => quote(staff, s, c.projectId, { reference: "X-1" })).code).toBe("conflict");
    setSupplierArchived(db, staff, s, true);
    expect(err(() => quote(staff, s, c.projectId, { reference: "X-2" })).fieldErrors).toHaveProperty("supplierId");
  });
});

describe("proposals and the approval workflow", () => {
  function setup() {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    const s1 = supplier(staff, "S1"), s2 = supplier(staff, "S2");
    toQuoteRequested(staff, c.projectId);
    const q1 = quote(staff, s1, c.projectId, { reference: "A" });
    const q2 = quote(staff, s2, c.projectId, { reference: "B", lines: [{ category: "pv_module", description: "Panel", quantity: 8, unitPrice: "380000" }] });
    return { staff, c, s1, s2, q1, q2 };
  }
  const draft = (staff: ReturnType<typeof makeStaff>, projectId: string, quotes: string[]) =>
    createProposalDraft(db, staff, projectId, { title: "Options", options: quotes.map((q, i) => ({ quoteId: q, label: `Option ${i + 1}`, customerSummary: "" })) });

  it("generates a proposal from selected quotations; publishing moves the project to PROPOSAL_READY and is visible to the customer", () => {
    const { staff, c, q1, q2 } = setup();
    const p = draft(staff, c.projectId, [q1, q2]);
    expect(listProposalsForCustomer(db, c.actor, c.projectId)).toHaveLength(0); // drafts are invisible
    publishProposal(db, staff, p);
    expect((db.prepare("SELECT status FROM projects").get() as { status: string }).status).toBe("PROPOSAL_READY");
    const views = listProposalsForCustomer(db, c.actor, c.projectId);
    expect(views).toHaveLength(1);
    expect(views[0].options).toHaveLength(2);
    expect(views[0].options[0].offer).toBe("confirmed_offer");
    expect(JSON.stringify(views)).not.toMatch(/source_note|internal_notes|email from sales/);
  });
  it("only quotations of this project, not drafts/withdrawn, can be proposed", () => {
    const { staff, c, s1, q1 } = setup();
    const other = makeCustomer(db);
    const foreign = quote(staff, s1, other.projectId, { reference: "F" });
    expect(err(() => draft(staff, c.projectId, [foreign])).message).toMatch(/linked to this project/);
    const dq = quote(staff, s1, c.projectId, { reference: "D", status: "draft" });
    expect(err(() => draft(staff, c.projectId, [dq])).message).toMatch(/draft/);
    expect(err(() => createProposalDraft(db, staff, c.projectId, { title: "t", options: [] })).fieldErrors).toHaveProperty("options");
    expect(draft(staff, c.projectId, [q1])).toBeTruthy();
  });
  it("publishing requires QUOTE_REQUESTED status", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    const s = supplier(staff);
    const q = quote(staff, s, c.projectId);
    const p = draft(staff, c.projectId, [q]);
    expect(err(() => publishProposal(db, staff, p)).code).toBe("workflow");
  });
  it("customer approval records who/when, moves to APPROVED, snapshots the financial summary — and is NOT a purchase", () => {
    const { staff, c, q1, q2 } = setup();
    const p = draft(staff, c.projectId, [q1, q2]);
    publishProposal(db, staff, p);
    approveProposal(db, c.actor, p, q2, { note: "Go with B" });
    const proj = db.prepare("SELECT status, approved_proposal_id, financial_summary FROM projects").get() as { status: string; approved_proposal_id: string; financial_summary: string };
    expect(proj.status).toBe("APPROVED"); // not PROCUREMENT
    expect(proj.approved_proposal_id).toBe(p);
    const fin = JSON.parse(proj.financial_summary);
    expect(fin).toMatchObject({ quoteId: q2, currency: "MNT", totalMinor: 8 * 380000 + 1000000 });
    expect(db.prepare("SELECT status, approved_by, approved_quote_id FROM proposals WHERE id = ?").get(p)).toEqual({ status: "approved", approved_by: c.userId, approved_quote_id: q2 });
    const ev = db.prepare("SELECT actor_label FROM project_events WHERE event_type = 'PROPOSAL_APPROVED'").get() as { actor_label: string };
    expect(ev.actor_label).toMatch(/^Customer:/);
    expect(err(() => approveProposal(db, c.actor, p, q1)).code).toBe("workflow"); // cannot approve twice
    expect(err(() => changeStatus(db, staff, c.projectId, { to: "INSTALLATION" })).code).toBe("workflow");
  });
  it("another customer cannot approve; a quote outside the proposal cannot be approved", () => {
    const { staff, c, q1, s1 } = setup();
    const outsider = makeCustomer(db);
    const p = draft(staff, c.projectId, [q1]);
    publishProposal(db, staff, p);
    expect(err(() => approveProposal(db, outsider.actor, p, q1)).code).toBe("not_found");
    expect(err(() => approveProposal(db, staff, p, q1)).code).toBe("not_found"); // staff must use the explicit on-behalf path
    const extra = quote(staff, s1, c.projectId, { reference: "EXTRA" });
    expect(err(() => approveProposal(db, c.actor, p, extra)).code).toBe("invalid");
    expect((db.prepare("SELECT status FROM projects WHERE id = ?").get(c.projectId) as { status: string }).status).toBe("PROPOSAL_READY");
  });
  it("an expired quotation cannot be approved (stale offers are not current offers)", () => {
    const { staff, c, q1 } = setup();
    const p = draft(staff, c.projectId, [q1]);
    publishProposal(db, staff, p);
    const e = err(() => approveProposal(db, c.actor, p, q1, { today: new Date(Date.now() + 60 * 86_400_000) }));
    expect(e.code).toBe("workflow");
    expect(e.message).toMatch(/expired/i);
    expect(listProposalsForCustomer(db, c.actor, c.projectId, new Date(Date.now() + 60 * 86_400_000))[0].options[0].offer).toBe("expired");
  });
  it("indicative prices cannot be approved; demo prices only inside demo projects", () => {
    const { staff, c, s1 } = setup();
    const ind = quote(staff, s1, c.projectId, { reference: "IND", sourceType: "indicative", receivedOn: undefined, sourceNote: undefined });
    const p = draft(staff, c.projectId, [ind]);
    publishProposal(db, staff, p);
    expect(err(() => approveProposal(db, c.actor, p, ind)).message).toMatch(/not offers/i);
  });
  it("staff can record an approval given offline only with the evidence in a note, and it is labelled as on-behalf", () => {
    const { staff, c, q1 } = setup();
    const p = draft(staff, c.projectId, [q1]);
    publishProposal(db, staff, p);
    expect(err(() => approveProposal(db, staff, p, q1, { onBehalfOfCustomer: true })).message).toMatch(/evidence/i);
    approveProposal(db, staff, p, q1, { onBehalfOfCustomer: true, note: "Signed agreement received by email 2026-10-20" });
    const ev = db.prepare("SELECT actor_label FROM project_events WHERE event_type = 'PROPOSAL_APPROVED'").get() as { actor_label: string };
    expect(ev.actor_label).toMatch(/on behalf of customer/);
  });
  it("withdrawing a published proposal requires a reason and returns the project to QUOTE_REQUESTED", () => {
    const { staff, c, q1 } = setup();
    const p = draft(staff, c.projectId, [q1]);
    publishProposal(db, staff, p);
    expect(err(() => withdrawProposal(db, staff, p, "")).message).toMatch(/why/i);
    withdrawProposal(db, staff, p, "Prices changed");
    expect((db.prepare("SELECT status FROM projects").get() as { status: string }).status).toBe("QUOTE_REQUESTED");
    expect(listProposalsForCustomer(db, c.actor, c.projectId)).toHaveLength(0);
  });
  it("a quotation in a published proposal cannot be silently edited", () => {
    const { staff, c, q1, s1 } = setup();
    publishProposal(db, staff, draft(staff, c.projectId, [q1]));
    expect(err(() => updateQuote(db, staff, q1, { supplierId: s1, reference: "A", quoteDate: day(0), currency: "MNT", sourceType: "indicative", lines: [{ description: "x", quantity: 1, unitPrice: "1" }] })).code).toBe("workflow");
  });
  it("comparison inputs carry unknown values as unknown, not as zero", () => {
    const { staff, c, s1 } = setup();
    const q = quote(staff, s1, c.projectId, { reference: "U", pvKwp: undefined, leadTimeDays: undefined });
    const [input] = getComparisonInputs(db, [q]);
    expect(input.pvKwp).toBeNull();
    expect(input.leadTimeDays).toBeNull();
  });
});

describe("installation, commissioning, documents and warranties", () => {
  function approvedProject() {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    const s = supplier(staff);
    toQuoteRequested(staff, c.projectId);
    const q = quote(staff, s, c.projectId);
    const p = createProposalDraft(db, staff, c.projectId, { title: "P", options: [{ quoteId: q, label: "A" }] });
    publishProposal(db, staff, p);
    approveProposal(db, c.actor, p, q);
    return { staff, c, s };
  }
  it("walks APPROVED → PROCUREMENT → … and completion requires commissioning evidence", () => {
    const { staff, c } = approvedProject();
    for (const to of ["PROCUREMENT", "INSTALL_SCHEDULED", "INSTALLATION", "COMMISSIONING"] as const) changeStatus(db, staff, c.projectId, { to });
    expect(err(() => changeStatus(db, staff, c.projectId, { to: "COMPLETED" })).message).toMatch(/commissioning report|handover/i);
    const evidence = saveDocument(db, staff, pdf("commissioning.pdf"), { projectId: c.projectId, docType: "commissioning_report", customerVisible: true });
    changeStatus(db, staff, c.projectId, { to: "COMPLETED", documentId: evidence.id });
    changeStatus(db, staff, c.projectId, { to: "IN_SERVICE" });
    const ev = db.prepare("SELECT document_id FROM project_events WHERE new_status = 'COMPLETED'").get() as { document_id: string };
    expect(ev.document_id).toBe(evidence.id);
  });
  it("installed equipment is recorded only once installation starts; 'commissioned' needs evidence; warranty is 'recorded' only with a document", () => {
    const { staff, c } = approvedProject();
    expect(err(() => addAsset(db, staff, c.projectId, { category: "inverter", manufacturer: "M", model: "I" })).code).toBe("workflow");
    for (const to of ["PROCUREMENT", "INSTALL_SCHEDULED", "INSTALLATION"] as const) changeStatus(db, staff, c.projectId, { to });
    expect(err(() => addAsset(db, staff, c.projectId, { category: "inverter", manufacturer: "M", model: "I", commissioningState: "commissioned" })).code).toBe("workflow");
    const id = addAsset(db, staff, c.projectId, { category: "inverter", manufacturer: "M", model: "I" });
    expect(db.prepare("SELECT serial_number FROM installed_assets WHERE id = ?").get(id)).toEqual({ serial_number: null }); // never generated
    const w1 = addWarranty(db, staff, id, { provider: "M", terms: "as stated by supplier" });
    expect(db.prepare("SELECT verification_state FROM warranty_records WHERE id = ?").get(w1)).toEqual({ verification_state: "unverified" });
    const d = saveDocument(db, staff, pdf("warranty.pdf"), { projectId: c.projectId, docType: "warranty" });
    const w2 = addWarranty(db, staff, id, { provider: "M", documentId: d.id, startDate: "2026-01-01", endDate: "2036-01-01" });
    expect(db.prepare("SELECT verification_state FROM warranty_records WHERE id = ?").get(w2)).toEqual({ verification_state: "evidence_recorded" });
    expect(err(() => addWarranty(db, staff, id, { provider: "M", startDate: "2026-01-01", endDate: "2025-01-01" })).fieldErrors).toHaveProperty("endDate");
  });
  it("uploads: type, size and content are checked; stored under generated names; customers limited to their own document types", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    expect(err(() => saveDocument(db, staff, { name: "x.exe", mimeType: "application/octet-stream", bytes: Buffer.from("MZ") }, { projectId: c.projectId, docType: "other" })).message).toMatch(/зөвшөөрөгдөөгүй/);
    expect(err(() => saveDocument(db, staff, { name: "fake.pdf", mimeType: "application/pdf", bytes: Buffer.from("not a pdf") }, { projectId: c.projectId, docType: "other" })).message).toMatch(/агуулга/);
    expect(err(() => saveDocument(db, staff, { name: "big.pdf", mimeType: "application/pdf", bytes: Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(11 * 1024 * 1024)]) }, { projectId: c.projectId, docType: "other" })).message).toMatch(/10 МБ/);
    const d = saveDocument(db, staff, { name: "../../etc/passwd.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.4 x") }, { projectId: c.projectId, docType: "other", customerVisible: true });
    expect(d.original_name).not.toContain("/");
    expect(d.storage_path).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(fs.existsSync(getDocumentForDownload(db, c.actor, d.id)!.absPath)).toBe(true);
    expect(err(() => saveDocument(db, c.actor, pdf(), { projectId: c.projectId, docType: "commissioning_report" })).code).toBe("forbidden");
    const own = saveDocument(db, c.actor, pdf(), { projectId: c.projectId, docType: "site_photo" });
    expect(own.access).toBe("customer_visible");
  });
  it("supplier quotation documents stay internal even if staff try to share them", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    const s = supplier(staff);
    const q = quote(staff, s, c.projectId);
    const d = saveDocument(db, staff, pdf("quote.pdf"), { quoteId: q, docType: "quotation", customerVisible: true });
    expect(d.access).toBe("staff_only");
    expect(getDocumentForDownload(db, c.actor, d.id)).toBeNull();
    expect((db.prepare("SELECT document_id FROM quotes WHERE id = ?").get(q) as { document_id: string }).document_id).toBe(d.id);
  });
});

describe("administration", () => {
  it("only admins create staff; passwords for staff need 12+ chars; accounts can be disabled but not by themselves", () => {
    const staff = makeStaff(db), admin = makeStaff(db, "admin");
    const body = { fullName: "New Staff", email: "new@staff.test", password: "a-long-staff-pass", role: "staff" };
    expect(err(() => createStaffUser(db, staff, body)).code).toBe("forbidden");
    expect(err(() => createStaffUser(db, admin, { ...body, password: "short" })).fieldErrors).toHaveProperty("password");
    const id = createStaffUser(db, admin, body);
    expect(authenticate(db, "new@staff.test", "a-long-staff-pass")?.role).toBe("staff");
    expect(err(() => setUserStatus(db, admin, admin.id, "disabled")).code).toBe("workflow");
    setUserStatus(db, admin, id, "disabled");
    expect(authenticate(db, "new@staff.test", "a-long-staff-pass")).toBeNull();
    expect(authenticate(db, "new@staff.test", "wrong")).toBeNull();
  });
});
