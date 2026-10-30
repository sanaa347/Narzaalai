import { describe, expect, it } from "vitest";
import { listCustomerProjects, listOpsProjects } from "@/lib/services/projects";
import { hashPassword } from "@/lib/auth/password";
import { loadActor } from "@/lib/auth/session";
import { newId } from "@/lib/db";
import { createSupplier, getSupplier, listSuppliers } from "@/lib/services/suppliers";
import { createProduct, listProducts } from "@/lib/services/products";
import { createQuote, getQuoteDetail, listQuotes } from "@/lib/services/quotes";
import { day, makeCustomer, makeDb, makeStaff } from "./helpers";

describe("read paths enforce authorization inside the service (not only in the page)", () => {
  it("a customer cannot list every customer's projects through the staff query", () => {
    const db = makeDb();
    const a = makeCustomer(db);
    makeCustomer(db);
    expect(() => listOpsProjects(db, a.actor)).toThrow(/permission|forbidden/i);
    expect(listOpsProjects(db, makeStaff(db)).total).toBe(2);
  });

  it("a customer's own list contains only their organization's projects", () => {
    const db = makeDb();
    const a = makeCustomer(db);
    const b = makeCustomer(db);
    expect(listCustomerProjects(db, a.actor).map((p) => p.id)).toEqual([a.projectId]);
    expect(listCustomerProjects(db, b.actor).map((p) => p.id)).toEqual([b.projectId]);
  });

  it("a staff account is not given a customer list, and a customer without an organization sees nothing", () => {
    const db = makeDb();
    makeCustomer(db);
    expect(listCustomerProjects(db, makeStaff(db))).toEqual([]);
    const a = makeCustomer(db);
    expect(listCustomerProjects(db, { ...a.actor, orgIds: [] })).toEqual([]);
  });
});

describe("supplier, product and quotation reads are staff-only inside the service", () => {
  function setup() {
    const db = makeDb();
    const staff = makeStaff(db);
    const customer = makeCustomer(db);
    const supplierId = createSupplier(db, staff, { companyName: "Guard Test Supplier" });
    createProduct(db, staff, { category: "pv_module", manufacturer: "M", model: "X1", supplierId });
    const quoteId = createQuote(db, staff, {
      supplierId, projectId: customer.projectId, reference: "G-1", quoteDate: day(-2), receivedOn: day(-1), validUntil: day(20), currency: "MNT",
      sourceType: "supplier_quotation", sourceNote: "email", lines: [{ category: "pv_module", description: "Panel", quantity: 1, unitPrice: "1000" }],
    });
    // a user whose role has no portal but is linked to this supplier
    const sid = newId();
    db.prepare("INSERT INTO users (id, full_name, email, password_hash, role, supplier_id) VALUES (?,?,?,?,?,?)").run(sid, "Supplier User", `${sid}@s.test`, hashPassword("correct-horse-battery"), "supplier", supplierId);
    const supplierUser = loadActor(db, sid)!;
    // a staff account that has been disabled after its session was issued
    const disabled = makeStaff(db, "staff", "Disabled Staff");
    db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(disabled.id);
    return { db, staff, customer, supplierId, quoteId, supplierUser, disabledActor: { ...disabled, status: "disabled" as const } };
  }

  it("staff can read them", () => {
    const { db, staff, supplierId, quoteId } = setup();
    expect(listSuppliers(db, staff).length).toBe(1);
    expect(getSupplier(db, staff, supplierId)?.company_name).toBe("Guard Test Supplier");
    expect(listProducts(db, staff).length).toBe(1);
    expect(listQuotes(db, staff).length).toBe(1);
    expect(getQuoteDetail(db, staff, quoteId)?.lines.length).toBe(1);
  });

  it.each([
    ["anonymous", () => null],
    ["a customer", (c: ReturnType<typeof setup>) => c.customer.actor],
    ["a supplier-role user (even for their own supplier)", (c: ReturnType<typeof setup>) => c.supplierUser],
    ["a disabled staff account", (c: ReturnType<typeof setup>) => c.disabledActor],
  ])("%s is refused every read", (_name, who) => {
    const c = setup();
    const a = who(c);
    for (const fn of [
      () => listSuppliers(c.db, a),
      () => getSupplier(c.db, a, c.supplierId),
      () => listProducts(c.db, a),
      () => listQuotes(c.db, a),
      () => getQuoteDetail(c.db, a, c.quoteId),
    ]) expect(fn).toThrow(/permission/i);
  });
});
