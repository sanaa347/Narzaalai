import { Alert, Badge, Card, CardTitle, EmptyState, PageHeader, TableWrap, Td, Th } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { adapters, DEMO_TELEMETRY_LABEL, liveMonitoringAvailable, type TelemetryMetric } from "@/lib/integrations/device";
import { classifyOrigin } from "@/lib/integrations/telemetry";

export const metadata = { title: "Monitoring" };

const METRICS: { id: TelemetryMetric; text: string }[] = [
  { id: "pv_generation_kw", text: "Solar generation (kW)" },
  { id: "household_consumption_kw", text: "Consumption (kW)" },
  { id: "battery_soc_percent", text: "Battery state of charge (%)" },
  { id: "grid_import_kw", text: "Grid import (kW)" },
  { id: "fault_code", text: "Faults and alerts" },
];

interface Row { id: string; org_name: string; province: string; source: string; metric: string; value: number; unit: string; measured_at: string; quality: string; is_simulated: number }

export default async function MonitoringPage() {
  await requireStaff();
  const db = getDb();
  const rows = db.prepare(
    `SELECT t.id, o.name AS org_name, s.province, t.source, t.metric, t.value, t.unit, t.measured_at, t.quality, t.is_simulated
     FROM telemetry_points t JOIN sites s ON s.id = t.site_id JOIN organizations o ON o.id = s.org_id
     ORDER BY t.measured_at DESC LIMIT 100`,
  ).all() as Row[];
  const live = liveMonitoringAvailable();
  return (
    <>
      <PageHeader title="Monitoring" description="Future device and telemetry integration boundary." />
      <Alert tone={live ? "info" : "warn"} title={live ? `${adapters.length} integration adapter(s) registered` : "No live equipment integration is configured"} className="mb-6">
        {live ? "Adapters are registered; only readings with is_simulated = 0 come from real equipment." : "Narzaalai does not read from any inverter, battery or gateway yet, so no live generation, consumption, battery or fault data exists. Nothing on this page is, or may be presented as, live equipment data."}
      </Alert>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card aria-labelledby="m-boundary">
          <CardTitle id="m-boundary">Integration boundary</CardTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Adapters implement <code>DeviceAdapter</code> in <code>src/lib/integrations/device.ts</code>: test connection, register device, fetch readings (read-only).</li>
            <li>Readings are stored in <code>telemetry_points</code> with source, unit, timestamp, data quality and an actual-vs-simulated flag.</li>
            <li>There is deliberately no command channel: no remote switching and no grid-disconnection.</li>
            <li>Any simulated reading must be labelled <strong>{DEMO_TELEMETRY_LABEL}</strong>.</li>
          </ul>
          <h3 className="mt-4 text-sm font-semibold">Registered adapters</h3>
          {adapters.length === 0 ? <p className="text-sm text-muted">None.</p> : <ul className="text-sm">{adapters.map((a) => <li key={a.id}>{a.displayName} <span className="text-muted">({a.id})</span></li>)}</ul>}
        </Card>
        <Card aria-labelledby="m-metrics">
          <CardTitle id="m-metrics">Planned measurements</CardTitle>
          <ul className="space-y-1 text-sm">{METRICS.map((m) => <li key={m.id}><code>{m.id}</code> — {m.text}</li>)}</ul>
          <p className="mt-3 text-xs text-muted">Not yet collected from any device.</p>
        </Card>
      </div>
      <section className="mt-6" aria-labelledby="m-readings">
        <h2 id="m-readings" className="mb-2 text-base font-semibold">Stored readings</h2>
        {rows.length === 0 ? <EmptyState title="No telemetry stored">Nothing has been recorded in telemetry_points.</EmptyState> : (
          <TableWrap caption="Latest telemetry readings">
            <thead><tr><Th>Measured</Th><Th>Customer</Th><Th>Metric</Th><Th>Value</Th><Th>Source</Th><Th>Quality</Th><Th>Origin</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(r.measured_at)}</Td>
                  <Td>{r.org_name}<div className="text-xs text-muted">{r.province}</div></Td>
                  <Td>{r.metric}</Td>
                  <Td>{fmtNumber(r.value, 2)} {r.unit}</Td>
                  <Td>{r.source}</Td>
                  <Td>{r.quality}</Td>
                  <Td>{(() => {
                    const origin = classifyOrigin(r);
                    if (origin === "simulated") return <Badge tone="demo">{DEMO_TELEMETRY_LABEL}</Badge>;
                    if (origin === "device") return <Badge tone="success">Device reading</Badge>;
                    return <Badge tone="warn">Unverified origin: no registered integration</Badge>;
                  })()}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </>
  );
}
