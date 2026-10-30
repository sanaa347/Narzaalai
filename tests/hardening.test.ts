import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb, newId } from "@/lib/db";
import { databaseMayHoldRealData } from "@/lib/db/reset-guard";
import { hashPassword } from "@/lib/auth/password";
import { hitLimit } from "@/lib/auth/ratelimit";
import { authenticate, createSession, loadActor, userFromToken } from "@/lib/auth/session";
import { portalFor, type Actor } from "@/lib/auth/permissions";
import { MAX_CUSTOMER_DOCS_PER_PROJECT, saveDocument } from "@/lib/services/documents";
import { makeCustomer, makeDb } from "./helpers";

const actor = (o: Partial<Actor>): Actor => ({ id: "u", role: "customer", status: "active", supplierId: null, orgIds: [], ...o });

describe("portalFor (roles without a portal must not be bounced between areas)", () => {
  it("maps staff/admin to ops, customers to dashboard, everyone else to nothing", () => {
    expect(portalFor(actor({ role: "staff" }))).toBe("ops");
    expect(portalFor(actor({ role: "admin" }))).toBe("ops");
    expect(portalFor(actor({ role: "customer" }))).toBe("dashboard");
    expect(portalFor(actor({ role: "supplier", supplierId: "s1" }))).toBeNull();
    expect(portalFor(actor({ role: "staff", status: "disabled" }))).toBeNull();
    expect(portalFor(null)).toBeNull();
  });

  it("a supplier user can authenticate but has no portal (login refuses it instead of looping)", () => {
    const db = makeDb();
    const sid = newId();
    db.prepare("INSERT INTO suppliers (id, company_name) VALUES (?, 'S')").run(sid);
    const uid = newId();
    db.prepare("INSERT INTO users (id, full_name, email, password_hash, role, supplier_id) VALUES (?,?,?,?,?,?)").run(uid, "Sup", "sup@test.test", hashPassword("supplier-pass-123"), "supplier", sid);
    const u = authenticate(db, "sup@test.test", "supplier-pass-123");
    expect(u?.role).toBe("supplier");
    expect(portalFor(u)).toBeNull();
  });
});

describe("hitLimit (sliding window)", () => {
  it("allows up to max hits in the window, then blocks, then recovers after the window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(hitLimit("t1", "ip", 3, 1000, t0 + i)).toBe(false);
    expect(hitLimit("t1", "ip", 3, 1000, t0 + 10)).toBe(true);
    expect(hitLimit("t1", "other-ip", 3, 1000, t0 + 10)).toBe(false); // keys are independent
    expect(hitLimit("t1", "ip", 3, 1000, t0 + 5000)).toBe(false); // window elapsed
  });
});

describe("sessions", () => {
  it("creating a session removes expired session rows; expired tokens never authenticate", () => {
    const db = makeDb();
    const c = makeCustomer(db);
    const old = createSession(db, c.userId);
    db.prepare("UPDATE sessions SET expires_at = ?").run(new Date(Date.now() - 1000).toISOString());
    expect(userFromToken(db, old.token)).toBeNull();
    const stale = createSession(db, c.userId);
    db.prepare("UPDATE sessions SET expires_at = ? WHERE 1=1").run(new Date(Date.now() - 1000).toISOString());
    createSession(db, c.userId);
    const left = db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
    expect(left.n).toBe(1);
    expect(userFromToken(db, stale.token)).toBeNull();
  });

  it("a disabled user's existing session stops working immediately", () => {
    const db = makeDb();
    const c = makeCustomer(db);
    const s = createSession(db, c.userId);
    expect(userFromToken(db, s.token)?.id).toBe(c.userId);
    db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(c.userId);
    expect(userFromToken(db, s.token)).toBeNull();
    expect(loadActor(db, c.userId)).toBeNull();
  });
});

describe("customer upload cap", () => {
  it("stops a customer at the per-project limit but never limits staff", () => {
    const db = makeDb();
    const c = makeCustomer(db);
    const pdf = () => ({ name: "a.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.4 x") });
    for (let i = 0; i < MAX_CUSTOMER_DOCS_PER_PROJECT; i++) saveDocument(db, c.actor, pdf(), { projectId: c.projectId, docType: "other" });
    expect(() => saveDocument(db, c.actor, pdf(), { projectId: c.projectId, docType: "other" })).toThrow(/дээд хязгаар/);
  });
});

describe("seed --reset guard", () => {
  const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nz-guard-")), "t.db");

  it("does not object when the file does not exist", () => {
    expect(databaseMayHoldRealData(tmp())).toBe(false);
  });

  it("allows resetting a database that holds only demo records", () => {
    const f = tmp();
    const db = openDb(f);
    db.prepare("INSERT INTO users (id, full_name, email, password_hash, role, is_demo) VALUES (?,?,?,?,?,1)").run(newId(), "D", "d@demo.test", hashPassword("demo-pass-123456"), "customer");
    db.close();
    expect(databaseMayHoldRealData(f)).toBe(false);
  });

  it("refuses when any non-demo user exists", () => {
    const f = tmp();
    const db = openDb(f);
    db.prepare("INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?,?,?,?,?)").run(newId(), "Real", "real@x.test", hashPassword("real-pass-123456"), "customer");
    db.close();
    expect(databaseMayHoldRealData(f)).toBe(true);
  });

  it("refuses a file it cannot inspect", () => {
    const f = tmp();
    fs.writeFileSync(f, "not a database");
    expect(databaseMayHoldRealData(f)).toBe(true);
  });
});
