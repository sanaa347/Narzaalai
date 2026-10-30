import { beforeEach, describe, expect, it } from "vitest";
import { type Db } from "@/lib/db";
import { getOrganizationDetail } from "@/lib/services/customers";
import { makeCustomer, makeDb, makeStaff } from "./helpers";

let db: Db;
beforeEach(() => { db = makeDb(); });

describe("getOrganizationDetail", () => {
  it("returns members, sites and projects for staff", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    const orgId = (db.prepare("SELECT org_id FROM projects WHERE id = ?").get(c.projectId) as { org_id: string }).org_id;
    const d = getOrganizationDetail(db, staff, orgId)!;
    expect(d.members).toHaveLength(1);
    expect(d.sites).toHaveLength(1);
    expect(d.projects.map((p) => p.id)).toEqual([c.projectId]);
    expect(d.documentCounts.total).toBe(0);
  });
  it("refuses customers and anonymous callers", () => {
    const a = makeCustomer(db);
    const orgId = (db.prepare("SELECT org_id FROM projects WHERE id = ?").get(a.projectId) as { org_id: string }).org_id;
    expect(() => getOrganizationDetail(db, a.actor, orgId)).toThrow();
    expect(() => getOrganizationDetail(db, null, orgId)).toThrow();
  });
  it("returns null for unknown id", () => {
    expect(getOrganizationDetail(db, makeStaff(db), "nope")).toBeNull();
  });
});
