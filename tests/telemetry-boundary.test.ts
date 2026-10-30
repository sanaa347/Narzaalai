import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { adapters, liveMonitoringAvailable, type TelemetryReading } from "@/lib/integrations/device";
import { classifyOrigin, recordTelemetry } from "@/lib/integrations/telemetry";
import { makeCustomer, makeDb } from "./helpers";

const NOW = new Date("2026-10-29T03:00:00Z");
const reading = (siteId: string, over: Partial<TelemetryReading> = {}): TelemetryReading => ({
  siteId, assetId: null, source: "demo-generator", metric: "pv_generation_kw", value: 1.25, unit: "kW",
  measuredAt: "2026-10-29T02:59:00Z", quality: "unknown", isSimulated: true, ...over,
});
const siteOf = (db: ReturnType<typeof makeDb>, projectId: string) => (db.prepare("SELECT site_id AS s FROM projects WHERE id = ?").get(projectId) as { s: string }).s;

describe("this build has no live equipment integration", () => {
  it("registers no adapters, so nothing can be reported as live", () => {
    expect(adapters).toHaveLength(0);
    expect(liveMonitoringAvailable()).toBe(false);
  });
});

describe("recordTelemetry", () => {
  it("stores a simulated reading flagged is_simulated = 1", () => {
    const db = makeDb(); const c = makeCustomer(db); const site = siteOf(db, c.projectId);
    const id = recordTelemetry(db, reading(site), [], NOW);
    const row = db.prepare("SELECT * FROM telemetry_points WHERE id = ?").get(id) as { is_simulated: number; value: number };
    expect(row.is_simulated).toBe(1);
    expect(row.value).toBe(1.25);
  });

  it("REFUSES a reading claiming to be real equipment data when no adapter with that source is registered", () => {
    const db = makeDb(); const c = makeCustomer(db); const site = siteOf(db, c.projectId);
    expect(() => recordTelemetry(db, reading(site, { isSimulated: false, source: "acme-inverter-cloud" }), [], NOW)).toThrow(/No registered integration/);
    expect(() => recordTelemetry(db, reading(site, { isSimulated: false }), undefined, NOW)).toThrow(/No registered integration/); // default = the real (empty) registry
    expect((db.prepare("SELECT COUNT(*) n FROM telemetry_points").get() as { n: number }).n).toBe(0);
  });

  it("accepts a real reading only from a registered adapter id", () => {
    const db = makeDb(); const c = makeCustomer(db); const site = siteOf(db, c.projectId);
    const registry = [{ id: "acme-inverter-cloud" }];
    expect(() => recordTelemetry(db, reading(site, { isSimulated: false, source: "someone-else" }), registry, NOW)).toThrow();
    const id = recordTelemetry(db, reading(site, { isSimulated: false, source: "acme-inverter-cloud" }), registry, NOW);
    expect(db.prepare("SELECT is_simulated FROM telemetry_points WHERE id = ?").get(id)).toEqual({ is_simulated: 0 });
  });

  it.each([
    ["unknown metric", { metric: "grid_disconnect" as never }, /Unknown metric/],
    ["NaN value", { value: Number.NaN }, /finite/],
    ["Infinity", { value: Infinity }, /finite/],
    ["empty unit", { unit: " " }, /unit/],
    ["bad timestamp", { measuredAt: "yesterday-ish" }, /ISO/],
    ["timestamp in the future", { measuredAt: "2026-10-30T00:00:00Z" }, /future/],
  ])("rejects %s", (_n, over, msg) => {
    const db = makeDb(); const c = makeCustomer(db); const site = siteOf(db, c.projectId);
    expect(() => recordTelemetry(db, reading(site, over), [], NOW)).toThrow(msg);
  });

  it("rejects unknown sites and equipment that belongs to another site", () => {
    const db = makeDb(); const a = makeCustomer(db); const b = makeCustomer(db);
    expect(() => recordTelemetry(db, reading("no-such-site"), [], NOW)).toThrow(/Site not found/);
    expect(() => recordTelemetry(db, reading(siteOf(db, a.projectId), { assetId: "not-an-asset" }), [], NOW)).toThrow(/does not belong/);
    void b;
  });
});

describe("classifyOrigin never passes a row off as live equipment data without a registered integration", () => {
  it("simulated rows are simulated", () => expect(classifyOrigin({ source: "x", is_simulated: 1 }, [])).toBe("simulated"));
  it("a row with is_simulated = 0 and no registered adapter is UNVERIFIED (e.g. written by a script or direct SQL)", () => {
    expect(classifyOrigin({ source: "acme-inverter-cloud", is_simulated: 0 }, [])).toBe("unverified");
    expect(classifyOrigin({ source: "acme-inverter-cloud", is_simulated: 0 })).toBe("unverified"); // real registry is empty today
  });
  it("is 'device' only when a registered adapter matches the source", () => {
    expect(classifyOrigin({ source: "acme", is_simulated: 0 }, [{ id: "acme" }])).toBe("device");
    expect(classifyOrigin({ source: "other", is_simulated: 0 }, [{ id: "acme" }])).toBe("unverified");
  });
});

describe("the integration interface is read-only (no command channel, no grid switching)", () => {
  const src = fs.readFileSync("src/lib/integrations/device.ts", "utf8") + fs.readFileSync("src/lib/integrations/telemetry.ts", "utf8");
  it("exposes no method or metric that could switch, disconnect, set or command equipment", () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\b(sendCommand|execute|setPower|setMode|disconnect|reconnect|switchOff|switchOn|shutdown|write(Register|Setpoint)|control)\w*\s*[(:]/i);
  });
});
