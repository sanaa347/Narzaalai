/**
 * FUTURE device / monitoring boundary. NOTHING in this MVP implements these interfaces against real equipment.
 *
 * To add an integration: implement `DeviceAdapter` for a manufacturer API or a Narzaalai gateway, register it in
 * `adapters`, write measurements to `telemetry_points` with `is_simulated = 0` only for data that really came from the device.
 * Any simulated data MUST be written with `is_simulated = 1` and rendered with the label in `DEMO_TELEMETRY_LABEL`.
 *
 * Deliberately absent: any command channel (no remote switching, no grid-disconnection). Read-only telemetry only.
 */
export const DEMO_TELEMETRY_LABEL = "DEMO DATA — NOT LIVE EQUIPMENT DATA";

export type TelemetryMetric =
  | "pv_generation_kw"
  | "household_consumption_kw"
  | "battery_soc_percent"
  | "grid_import_kw"
  | "fault_code";

export interface TelemetryReading {
  siteId: string;
  assetId: string | null;
  source: string; // adapter id
  metric: TelemetryMetric;
  value: number;
  unit: string;
  measuredAt: string; // ISO timestamp from the device
  quality: "good" | "suspect" | "bad" | "unknown";
  isSimulated: boolean;
}

export interface DeviceAdapter {
  readonly id: string;
  readonly displayName: string;
  /** Verifies stored credentials with the manufacturer/gateway. Must never log secrets. */
  testConnection(): Promise<{ ok: boolean; detail: string }>;
  /** Registers a physical device against a site/asset. */
  registerDevice(input: { siteId: string; assetId: string | null; externalDeviceId: string }): Promise<void>;
  /** Pulls readings since a timestamp. Read-only. */
  fetchReadings(input: { siteId: string; since: string }): Promise<TelemetryReading[]>;
}

/** Empty by design: no live integration has been configured or tested. */
export const adapters: readonly DeviceAdapter[] = [];

export function liveMonitoringAvailable(): boolean {
  return adapters.length > 0;
}
