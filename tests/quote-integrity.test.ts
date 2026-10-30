import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { newId } from "@/lib/db";
import { createSupplier } from "@/lib/services/suppliers";
import { createQuote, getComparisonInputs, getQuoteDetail, updateQuote } from "@/lib/services/quotes";
import { day, makeCustomer, makeDb, makeStaff } from "./helpers";

let db: Db;
beforeEach(() => { db = makeDb(); });

const baseQuote = (supplierId: string, projectId: string, over: Record<string, unknown> = {}) => ({
  supplierId, projectId, reference: `Q-${newId().slice(0, 6)}`, quoteDate: day(-2), receivedOn: day(-1), validUntil: day(20), currency: "MNT",
  sourceType: "supplier_quotation", sourceNote: "email from sales, quote.pdf", lines: [{ category: "pv_module", description: "Panel", quantity: 3, unitPrice: "100000" }], ...over,
});

describe("delivery assumptions (migration 003)", () => {
  it("are stored, returned in the comparison input, and can be updated or left unknown", () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    const s = createSupplier(db, staff, { companyName: "Real Supplier LLC" });
    const id = createQuote(db, staff, baseQuote(s, c.projectId, { deliveryAssumptions: "Delivered to UB warehouse; unloading by customer", delivery: "50000" }));
    expect(getQuoteDetail(db, staff, id)!.quote.delivery_assumptions).toBe("Delivered to UB warehouse; unloading by customer");
    expect(getComparisonInputs(db, [id])[0].deliveryAssumptions).toBe("Delivered to UB warehouse; unloading by customer");

    updateQuote(db, staff, id, baseQuote(s, c.projectId, { reference: getQuoteDetail(db, staff, id)!.quote.reference, deliveryAssumptions: "Ex-works" }));
    expect(getQuoteDetail(db, staff, id)!.quote.delivery_assumptions).toBe("Ex-works");

    const unknown = createQuote(db, staff, baseQuote(s, c.projectId));
    expect(getQuoteDetail(db, staff, unknown)!.quote.delivery_assumptions).toBeNull(); // never invented
  });
});

describe("database-level quotation guards (direct SQL cannot bypass the service rules)", () => {
  const insert = (over: Record<string, unknown> = {}) => {
    const staff = makeStaff(db);
    const s = createSupplier(db, staff, { companyName: `S-${newId().slice(0, 5)}` });
    const row = { id: newId(), supplier_id: s, reference: "R", quote_date: day(-1), received_on: day(-1), currency: "MNT", source_type: "supplier_quotation", source_note: "email", ...over };
    return db.prepare(
      "INSERT INTO quotes (id, supplier_id, reference, quote_date, received_on, currency, source_type, source_note) VALUES (@id,@supplier_id,@reference,@quote_date,@received_on,@currency,@source_type,@source_note)",
    ).run(row);
  };

  it("accepts a well-formed supplier quotation", () => {
    expect(() => insert()).not.toThrow();
  });
  it("rejects an unknown currency on insert and on update", () => {
    expect(() => insert({ currency: "XYZ" })).toThrow(/currency/);
    insert();
    expect(() => db.prepare("UPDATE quotes SET currency = 'BTC'").run()).toThrow(/currency/);
  });
  it("rejects a supplier quotation with no received date or no source note", () => {
    expect(() => insert({ received_on: null })).toThrow(/received_on and source_note/);
    expect(() => insert({ source_note: null })).toThrow(/received_on and source_note/);
    expect(() => insert({ source_note: "   " })).toThrow(/received_on and source_note/);
  });
  it("still allows indicative and demo prices without a received date (they are never offers)", () => {
    expect(() => insert({ source_type: "indicative", received_on: null, source_note: null })).not.toThrow();
  });
  it("cannot turn an existing indicative price into a supplier quotation without evidence", () => {
    insert({ source_type: "indicative", received_on: null, source_note: null });
    expect(() => db.prepare("UPDATE quotes SET source_type = 'supplier_quotation'").run()).toThrow(/received_on and source_note/);
  });
  it("rejects a line item priced in a different currency than its quotation", () => {
    insert({ currency: "MNT" });
    const q = db.prepare("SELECT id FROM quotes").get() as { id: string };
    const line = (currency: string) => db.prepare(
      "INSERT INTO quote_line_items (id, quote_id, description, quantity, unit_price_minor, currency, line_total_minor) VALUES (?,?,?,?,?,?,?)",
    ).run(newId(), q.id, "x", 1, 100, currency, 100);
    expect(() => line("USD")).toThrow(/currency/);
    expect(() => line("MNT")).not.toThrow();
  });
});

describe("money consistency guards (migration 004) — direct SQL cannot create inconsistent money", () => {
  const setup = () => {
    const staff = makeStaff(db);
    const c = makeCustomer(db);
    const s = createSupplier(db, staff, { companyName: "Guard Test Supplier LLC" });
    const id = createQuote(db, staff, baseQuote(s, c.projectId, { installation: "50000" }));
    const line = db.prepare("SELECT id FROM quote_line_items WHERE quote_id = ?").get(id) as { id: string };
    return { staff, c, s, id, line };
  };

  it("refuses to change a quotation's currency while its lines are priced in another currency", () => {
    const { id } = setup();
    expect(() => db.prepare("UPDATE quotes SET currency = 'USD' WHERE id = ?").run(id)).toThrow(/currency/i);
    expect((db.prepare("SELECT currency FROM quotes WHERE id = ?").get(id) as { currency: string }).currency).toBe("MNT");
  });

  it("refuses to change one line's currency on its own", () => {
    const { line } = setup();
    expect(() => db.prepare("UPDATE quote_line_items SET currency = 'EUR' WHERE id = ?").run(line.id)).toThrow(/currency/i);
  });

  it("refuses a line total that is not quantity x unit price (insert and update)", () => {
    const { id, line } = setup();
    expect(() => db.prepare("UPDATE quote_line_items SET line_total_minor = 1 WHERE id = ?").run(line.id)).toThrow(/line_total_minor/);
    expect(() => db.prepare("UPDATE quote_line_items SET quantity = 99 WHERE id = ?").run(line.id)).toThrow(/line_total_minor/);
    expect(() =>
      db.prepare("INSERT INTO quote_line_items (id, quote_id, category, description, quantity, unit_price_minor, currency, line_total_minor) VALUES (?,?,?,?,?,?,?,?)")
        .run(newId(), id, "other", "bad", 2, 1000, "MNT", 1999),
    ).toThrow(/line_total_minor/);
  });

  it("refuses a quotation total that is not the sum of its parts (insert and update)", () => {
    const { id, s, c } = setup();
    expect(() => db.prepare("UPDATE quotes SET total_minor = 1 WHERE id = ?").run(id)).toThrow(/total_minor/);
    expect(() => db.prepare("UPDATE quotes SET installation_minor = installation_minor + 1 WHERE id = ?").run(id)).toThrow(/total_minor/);
    expect(() =>
      db.prepare("INSERT INTO quotes (id, supplier_id, project_id, reference, quote_date, currency, total_minor, source_type, status) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(newId(), s, c.projectId, "RAW-1", day(0), "MNT", 5, "indicative", "draft"),
    ).toThrow(/total_minor/);
  });

  it("does not block a legitimate edit: changing a quotation's currency through the service replaces its lines in the new currency", () => {
    const { staff, c, s, id } = setup();
    const ref = getQuoteDetail(db, staff, id)!.quote.reference;
    updateQuote(db, staff, id, baseQuote(s, c.projectId, { reference: ref, currency: "USD", lines: [{ category: "pv_module", description: "Panel", quantity: 3, unitPrice: "100.50" }] }));
    const d = getQuoteDetail(db, staff, id)!;
    expect(d.quote.currency).toBe("USD");
    expect(d.lines.every((l) => l.currency === "USD")).toBe(true);
    expect(d.quote.total_minor).toBe(3 * 10050);
  });

  it("is reversible: the documented DROP TRIGGER statements remove every guard added by 004 and leave the data untouched", () => {
    const { id } = setup();
    const before = db.prepare("SELECT total_minor FROM quotes WHERE id = ?").get(id);
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('trg_quotes_currency_vs_lines','trg_quote_lines_currency_update','trg_quote_lines_total_insert','trg_quote_lines_total_update','trg_quotes_total_insert','trg_quotes_total_update')").all() as { name: string }[]).map((r) => r.name);
    expect(names).toHaveLength(6);
    for (const n of names) db.exec(`DROP TRIGGER ${n}`);
    expect(db.prepare("SELECT total_minor FROM quotes WHERE id = ?").get(id)).toEqual(before);
    expect(() => db.prepare("UPDATE quotes SET total_minor = 1 WHERE id = ?").run(id)).not.toThrow(); // proves they were the only guard
  });
});
