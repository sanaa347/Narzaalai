import type { Db } from "@/lib/db";
import { newId } from "@/lib/db";
import { DomainError } from "@/lib/domain/errors";
import { adapters, type DeviceAdapter, type TelemetryReading } from "./device";

/**
 * The ONLY sanctioned way to store telemetry, and the only place that decides how a stored reading may be described.
 *
 *  - A reading claiming to come from real equipment (`isSimulated: false`) is refused unless an adapter whose id equals
 *    its `source` is registered. With no registered adapter (today) nothing can be stored as a device reading.
 *  - Simulated readings are stored with `is_simulated = 1` and are always shown under DEMO_TELEMETRY_LABEL.
 *  - `classifyOrigin` re-checks at display time, so a row written by some other route (a script, an import, a direct SQL
 *    insert with is_simulated = 0) is shown as "unverified origin" instead of being passed off as live equipment data.
 *
 * Read-only by design: there is no function here, and no field on DeviceAdapter, that sends a command to equipment.
 */

export const TELEMETRY_METRICS = ["pv_generation_kw", "household_consumption_kw", "battery_soc_percent", "grid_import_kw", "fault_code"] as const;

export type Origin = "simulated" | "device" | "unverified";

export function classifyOrigin(row: { source: string; is_simulated: number }, registry: readonly Pick<DeviceAdapter, "id">[] = adapters): Origin {
  if (row.is_simulated === 1) return "simulated";
  return registry.some((a) => a.id === row.source) ? "device" : "unverified";
}

export function recordTelemetry(db: Db, r: TelemetryReading, registry: readonly Pick<DeviceAdapter, "id">[] = adapters, now = new Date()): string {
  if (!(TELEMETRY_METRICS as readonly string[]).includes(r.metric)) throw new DomainError(`Unknown metric: ${r.metric}`);
  if (typeof r.value !== "number" || !Number.isFinite(r.value)) throw new DomainError("Reading value must be a finite number.");
  if (!r.unit.trim()) throw new DomainError("Reading needs a unit.");
  if (!r.source.trim()) throw new DomainError("Reading needs a source.");
  const t = new Date(r.measuredAt).getTime();
  if (Number.isNaN(t)) throw new DomainError("measuredAt must be an ISO timestamp.");
  if (t > now.getTime() + 5 * 60_000) throw new DomainError("measuredAt is in the future.");
  if (!r.isSimulated && !registry.some((a) => a.id === r.source)) {
    throw new DomainError(`No registered integration "${r.source}": a reading cannot be stored as real equipment data. Mark it simulated or register and test an adapter first.`, "conflict");
  }
  const site = db.prepare("SELECT 1 FROM sites WHERE id = ?").get(r.siteId);
  if (!site) throw new DomainError("Site not found.", "not_found");
  if (r.assetId && !db.prepare("SELECT 1 FROM installed_assets WHERE id = ? AND site_id = ?").get(r.assetId, r.siteId)) {
    throw new DomainError("Equipment does not belong to this site.", "not_found");
  }
  const id = newId();
  db.prepare(
    "INSERT INTO telemetry_points (id, site_id, asset_id, source, metric, value, unit, measured_at, quality, is_simulated) VALUES (?,?,?,?,?,?,?,?,?,?)",
  ).run(id, r.siteId, r.assetId, r.source, r.metric, r.value, r.unit, new Date(t).toISOString(), r.quality, r.isSimulated ? 1 : 0);
  return id;
}
