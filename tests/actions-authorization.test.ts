/**
 * Systematic authorization test for EVERY exported server action.
 *
 * Server actions are public POST endpoints: hiding a button proves nothing. This file imports the action modules and
 * enumerates their exports, so a newly added action is covered automatically and fails here if it forgets to check
 * the caller. For each action we call it with realistic ids as: anonymous, a customer (wrong role), another
 * customer (right role, wrong records) and a plain staff member on admin-only actions — and require that the database
 * is byte-for-byte unchanged afterwards.
 */
import crypto from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

let db: Db;
let currentActor: SessionUser | null = null;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("@/lib/auth/current", () => ({ getCurrentUser: async () => currentActor }));
vi.mock("@/lib/db", async (orig) => ({ ...(await orig<typeof import("@/lib/db")>()), getDb: () => db }));

import { makeCustomer, makeDb, makeStaff, day } from "./helpers";
import * as opsProjects from "@/lib/actions/ops-projects";
import * as opsCatalog from "@/lib/actions/ops-catalog";
import * as customerActions from "@/lib/actions/customer";
import { createSupplier } from "@/lib/services/suppliers";
import { createQuote } from "@/lib/services/quotes";
import { createProposalDraft, publishProposal } from "@/lib/services/proposals";
import { changeStatus, requestInfo } from "@/lib/services/workflow";
import { initialFormState } from "@/lib/actions/state";

type Action = (prev: typeof initialFormState, form: FormData) => Promise<{ ok?: boolean; message?: string }>;
const actionsOf = (mod: Record<string, unknown>): [string, Action][] =>
  Object.entries(mod).filter(([, v]) => typeof v === "function") as [string, Action][];

const ADMIN_ONLY = ["createStaffAction", "setUserStatusAction"];
const NO_PERMISSION = /You do not have permission|Таны эрх энэ үйлдэлд хүрэлцэхгүй/;

/** Hash of every row of every table: any write — even a single changed column — changes it. */
function snapshot(d: Db): string {
  const tables = (d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((t) => t.name);
  const h = crypto.createHash("sha256");
  for (const t of tables) {
    h.update(t);
    h.update(JSON.stringify(d.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all()));
  }
  return h.digest("hex");
}

let staff: SessionUser, admin: SessionUser, victim: ReturnType<typeof makeCustomer>, intruder: ReturnType<typeof makeCustomer>;
let form: FormData;

beforeAll(() => {
  db = makeDb();
  staff = makeStaff(db, "staff");
  admin = makeStaff(db, "admin", "Admin");
  victim = makeCustomer(db);
  intruder = makeCustomer(db);

  // A real published proposal + open info request on the victim's project, so every id below points at live data.
  const sup = createSupplier(db, staff, { companyName: "Auth Test Supplier" });
  changeStatus(db, staff, victim.projectId, { to: "ASSESSMENT" });
  changeStatus(db, staff, victim.projectId, { to: "QUOTE_REQUESTED" });
  const quoteId = createQuote(db, staff, {
    supplierId: sup, projectId: victim.projectId, reference: "AUTH-Q1", quoteDate: day(-1), receivedOn: day(-1), validUntil: day(20), currency: "MNT",
    sourceType: "supplier_quotation", sourceNote: "test", lines: [{ category: "pv_module", description: "Panel", quantity: 1, unitPrice: "1000" }],
  });
  const proposalId = createProposalDraft(db, staff, victim.projectId, { title: "T", options: [{ quoteId, label: "Opt", customerSummary: "" }] });
  publishProposal(db, staff, proposalId);
  requestInfo(db, staff, victim.projectId, "Please send a photo");
  const infoRequestId = (db.prepare("SELECT id FROM info_requests WHERE project_id = ?").get(victim.projectId) as { id: string }).id;
  const assessmentId = (db.prepare("SELECT id FROM assessments LIMIT 1").get() as { id: string }).id;

  form = new FormData();
  const ids: Record<string, string> = {
    projectId: victim.projectId, proposalId, quoteId, id: quoteId, supplierId: sup, assessmentId, infoRequestId, userId: staff.id,
    documentId: "x", assetId: "x", ticketId: "x", to: "COMPLETED", state: "verified", note: "forged", body: "forged", message: "forged",
    response: "forged", title: "forged", companyName: "forged", fullName: "Forged", email: "forged@example.test", password: "forged-password-123",
    role: "admin", status: "disabled", access: "customer_visible", docType: "commissioning_report", archive: "1", description: "forged",
    reference: "FORGED", currency: "MNT", sourceType: "supplier_quotation", manufacturer: "forged", model: "forged", category: "pv_module",
  };
  for (const [k, v] of Object.entries(ids)) form.append(k, v);
  form.append("lines", "[]");
  form.append("file", new File([Buffer.from("%PDF-1.4 forged")], "forged.pdf", { type: "application/pdf" }));
});

const staffActions = () => [...actionsOf(opsProjects), ...actionsOf(opsCatalog)];

describe("the action modules are enumerated (so the checks below cannot silently cover nothing)", () => {
  it("finds a plausible number of staff and customer actions", () => {
    expect(staffActions().length).toBeGreaterThanOrEqual(30);
    expect(actionsOf(customerActions).length).toBeGreaterThanOrEqual(3);
  });
});

describe("anonymous callers", () => {
  it("every staff and customer action refuses (redirect to /login) and changes nothing", async () => {
    currentActor = null;
    const before = snapshot(db);
    for (const [name, fn] of [...staffActions(), ...actionsOf(customerActions)]) {
      await expect(fn(initialFormState, form), name).rejects.toThrow("REDIRECT:/login");
    }
    expect(snapshot(db)).toBe(before);
  });
});

describe("a customer (wrong role) calling staff actions", () => {
  it("every staff action returns a permission error and changes nothing", async () => {
    currentActor = victim.actor; // even the project's own owner
    const before = snapshot(db);
    for (const [name, fn] of staffActions()) {
      const r = await fn(initialFormState, form);
      expect(r.ok, name).toBe(false);
      expect(r.message, name).toMatch(NO_PERMISSION);
    }
    expect(snapshot(db)).toBe(before);
  });
});

describe("staff calling customer-only actions", () => {
  it("are refused: a staff session cannot answer for a customer or approve in their name through the customer endpoint", async () => {
    currentActor = staff;
    const before = snapshot(db);
    for (const [name, fn] of actionsOf(customerActions)) {
      const r = await fn(initialFormState, form);
      expect(r.ok, name).toBe(false);
      expect(r.message, name).toMatch(NO_PERMISSION);
    }
    expect(snapshot(db)).toBe(before);
  });
});

describe("plain staff calling administrator-only actions", () => {
  it("user-management actions refuse a non-admin and create/disable no accounts", async () => {
    currentActor = staff;
    const before = snapshot(db);
    for (const name of ADMIN_ONLY) {
      const fn = (opsCatalog as Record<string, unknown>)[name] as Action;
      expect(fn, `${name} exists`).toBeTypeOf("function");
      const r = await fn(initialFormState, form);
      expect(r.ok, name).toBe(false);
      expect(r.message, name).toMatch(NO_PERMISSION);
    }
    expect(snapshot(db)).toBe(before);
  });

  it("the same actions are the only ones that demand admin (a new admin-only action must be added to ADMIN_ONLY)", async () => {
    // If an action refuses a plain staff member, it must be on the list; otherwise the list is stale.
    currentActor = staff;
    const refused = [];
    for (const [name, fn] of staffActions()) {
      const r = await fn(initialFormState, new FormData()).catch(() => ({ ok: true, message: "threw" }));
      if (r.ok === false && r.message && NO_PERMISSION.test(r.message)) refused.push(name);
    }
    expect(refused.sort()).toEqual([...ADMIN_ONLY].sort());
  });
});

describe("another customer (right role, someone else's records)", () => {
  it("cannot approve the victim's proposal, answer their information request, or upload to their project", async () => {
    currentActor = intruder.actor;
    const before = snapshot(db);
    for (const [name, fn] of actionsOf(customerActions)) {
      const r = await fn(initialFormState, form);
      expect(r.ok, name).toBe(false);
    }
    expect(snapshot(db)).toBe(before);
    // sanity: the project is untouched and still waiting for ITS owner
    expect((db.prepare("SELECT status FROM projects WHERE id = ?").get(victim.projectId) as { status: string }).status).toBe("PROPOSAL_READY");
  });

  it("control: the rightful owner CAN act on the same records, so the refusals above are about ownership, not broken fixtures", async () => {
    currentActor = victim.actor;
    const r = await customerActions.answerInfoAction(initialFormState, form);
    expect(r.ok).toBe(true);
    expect((db.prepare("SELECT status FROM info_requests WHERE project_id = ?").get(victim.projectId) as { status: string }).status).toBe("answered");
  });
});

describe("a disabled account", () => {
  it("is treated as signed out by getCurrentUser's contract: even a staff id with status=disabled cannot run actions", async () => {
    const disabled: SessionUser = { ...staff, status: "disabled" };
    currentActor = disabled;
    const before = snapshot(db);
    for (const [name, fn] of staffActions()) {
      const r = await fn(initialFormState, form).catch(() => ({ ok: false, message: "threw" }));
      expect(r.ok, name).toBe(false);
    }
    expect(snapshot(db)).toBe(before);
    void admin;
  });
});
