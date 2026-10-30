import { Badge, Card, CardTitle, DefList, TableWrap, Td, Th } from "@/components/ui/primitives";
import { VerificationBadge } from "@/components/ui/status";
import { ActionForm, ConfirmSubmit, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/forms";
import { addNoteAction, closeInfoRequestAction, requestInfoAction, setVerificationAction } from "@/lib/actions/ops-projects";
import { fmtDateTime, fmtMoney, fmtNumber, parseJson } from "@/lib/format";
import { L, lab } from "@/i18n";
import type { ProjectBundle } from "@/lib/services/projects";
import type { PrelimResult } from "@/lib/solar/prelim";

const PROV_LABEL: Record<string, string> = { customer_provided: "Customer-provided", unknown: "Unknown / awaiting" };

export function CustomerSite({ b }: { b: ProjectBundle }) {
  const { org, site } = b;
  return (
    <Card aria-labelledby="sec-customer">
      <CardTitle id="sec-customer">Customer &amp; site</CardTitle>
      <DefList cols={3} items={[
        { label: "Organization", value: org.name },
        { label: "Type", value: lab("en", "customerType", org.organization_type) },
        { label: "Contact", value: org.contact_name },
        { label: "Phone", value: org.contact_phone },
        { label: "Email", value: org.contact_email },
        { label: "Province / city", value: [site.province, site.district, site.city].filter(Boolean).join(", ") },
        { label: "Property type", value: lab("en", "propertyType", site.property_type) },
        { label: "Ownership", value: lab("en", "ownership", site.ownership) },
        { label: "Address", value: site.address },
        { label: "Coordinates", value: site.latitude != null && site.longitude != null ? `${site.latitude}, ${site.longitude}` : null },
        { label: "Install area (m²)", value: site.install_area_m2 != null ? fmtNumber(site.install_area_m2, 1) : null },
        { label: "Area note", value: site.install_area_note },
        { label: "Shading / limitations", value: site.shading_notes },
        { label: "Location description", value: site.location_description },
      ]} />
    </Card>
  );
}

export function EnergyProfile({ b }: { b: ProjectBundle }) {
  const e = b.energy;
  const prov = parseJson<Record<string, string>>(e.provenance, {});
  const objectives = parseJson<string[]>(e.objectives, []).map((o) => lab("en", "objective", o)).join("; ");
  const provRows: { key: string; label: string; value: string | null }[] = [
    { key: "monthly_kwh", label: L.en.missing.monthly_kwh, value: e.monthly_kwh != null ? `${fmtNumber(e.monthly_kwh, 1)} kWh` : null },
    { key: "bill_amount", label: L.en.missing.bill_amount, value: e.bill_amount_minor != null ? `${fmtMoney(e.bill_amount_minor, e.bill_currency)}${e.billing_period ? ` (${e.billing_period})` : ""}` : null },
    { key: "install_area", label: L.en.missing.install_area, value: b.site.install_area_m2 != null ? `${fmtNumber(b.site.install_area_m2, 1)} m²` : null },
    { key: "shading", label: L.en.missing.shading, value: b.site.shading_notes },
    { key: "major_loads", label: L.en.missing.major_loads, value: e.major_loads },
    { key: "critical_loads", label: L.en.missing.critical_loads, value: e.critical_loads },
    { key: "coordinates", label: L.en.missing.coordinates, value: b.site.latitude != null ? `${b.site.latitude}, ${b.site.longitude}` : null },
    { key: "budget", label: "Budget", value: e.budget_min_minor != null || e.budget_max_minor != null ? `${fmtMoney(e.budget_min_minor, e.budget_currency)} – ${fmtMoney(e.budget_max_minor, e.budget_currency)}` : null },
  ];
  return (
    <Card aria-labelledby="sec-energy">
      <CardTitle id="sec-energy">Energy profile &amp; data provenance</CardTitle>
      <TableWrap caption="Submitted energy data and provenance">
        <thead><tr><Th>Item</Th><Th>Value</Th><Th>Provenance</Th></tr></thead>
        <tbody>
          {provRows.map((r) => {
            const p = r.value ? (prov[r.key] === "customer_provided" || !prov[r.key] ? "customer_provided" : prov[r.key]) : "unknown";
            return (
              <tr key={r.key}>
                <Td className="font-medium">{r.label}</Td>
                <Td>{r.value ?? <span className="text-muted">—</span>}</Td>
                <Td><Badge tone={p === "customer_provided" ? "neutral" : "warn"}>{PROV_LABEL[p] ?? p}</Badge></Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      <div className="mt-4">
        <DefList cols={3} items={[
          { label: "Usage figures known", value: e.usage_known ? "Yes" : "Customer said unknown" },
          { label: "Operating hours", value: e.operating_hours },
          { label: "Backup needed", value: lab("en", "backup", e.backup_needed) },
          { label: "Existing equipment", value: e.existing_equipment },
          { label: "Objectives", value: objectives },
          { label: "Timeframe", value: lab("en", "timeframe", e.timeframe) },
          ...(e.business_name ? [
            { label: "Business name", value: e.business_name },
            { label: "Category", value: e.business_category },
            { label: "Business hours", value: e.business_operating_hours },
            { label: "Daily pattern", value: e.business_usage_pattern },
            { label: "Seasonal pattern", value: e.business_seasonal_pattern },
            { label: "Critical equipment", value: e.business_critical_equipment },
            { label: "Other sites", value: e.additional_sites_note },
          ] : []),
        ]} />
      </div>
    </Card>
  );
}

export function AssessmentResult({ b }: { b: ProjectBundle }) {
  const a = b.assessment;
  const r = parseJson<PrelimResult | null>(a.results, null);
  const missing = parseJson<string[]>(a.missing_data, []);
  return (
    <Card aria-labelledby="sec-assess">
      <CardTitle id="sec-assess" actions={<VerificationBadge state={a.verification_state} lang="en" />}>Assessment &amp; preliminary plan</CardTitle>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-sun-800">PRELIMINARY — NOT A QUOTATION</p>
      <DefList cols={3} items={[
        { label: "Assessment ref", value: a.reference },
        { label: "Calculation version", value: a.calc_version },
        { label: "Confidence", value: r ? lab("en", "confidence", r.confidence) : null },
        { label: "Annual consumption (kWh/yr)", value: r?.annualKwh != null ? fmtNumber(r.annualKwh) : null },
        { label: "Battery", value: r ? lab("en", "batteryNote", r.batteryNote) : null },
        { label: "Next step", value: r ? (r.nextStep === "technical_assessment" ? "Technical assessment" : "Customer to provide consumption") : null },
      ]} />
      {r && r.options.length > 0 ? (
        <div className="mt-4">
          <TableWrap caption="Indicative capacity options">
            <thead><tr><Th>Offset target</Th><Th>Annual target (kWh)</Th><Th>Indicative PV (kWp)</Th><Th>Area needed (m²)</Th><Th>Area check</Th></tr></thead>
            <tbody>
              {r.options.map((o) => (
                <tr key={o.id}>
                  <Td>{Math.round(o.offsetTarget * 100)}%</Td>
                  <Td>{fmtNumber(o.annualTargetKwh)}</Td>
                  <Td>{o.pvKwpRange.low}–{o.pvKwpRange.high}</Td>
                  <Td>{o.areaNeededM2.low}–{o.areaNeededM2.high}</Td>
                  <Td>{lab("en", "areaCheck", o.areaCheck)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      ) : <p className="mt-3 text-sm text-muted">No capacity range: insufficient data (no consumption figure).</p>}
      {r && (
        <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          <div><h3 className="font-semibold">Assumptions</h3><ul className="ml-4 list-disc text-muted">{r.assumptions.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div><h3 className="font-semibold">Limitations</h3><ul className="ml-4 list-disc text-muted">{r.limitations.map((x) => <li key={x}>{lab("en", "limitation", x)}</li>)}</ul></div>
        </div>
      )}
      <div className="mt-4">
        <h3 className="text-sm font-semibold">Missing information ({missing.length})</h3>
        {missing.length ? (
          <ul className="mt-1 space-y-1 text-sm">
            {missing.map((k) => <li key={k}><Badge tone="warn">{lab("en", "missing", k)}</Badge> <span className="text-muted">{lab("en", "missingWhy", k)}</span></li>)}
          </ul>
        ) : <p className="text-sm text-muted">Nothing flagged as missing.</p>}
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium">Recorded input snapshot (reproducibility)</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-navy-50 p-3 text-xs">{JSON.stringify(parseJson(a.input_snapshot, {}), null, 2)}</pre>
      </details>
      <hr className="my-4 border-navy-100" />
      <ActionForm action={setVerificationAction}>
        <input type="hidden" name="assessmentId" value={a.id} />
        <h3 className="text-sm font-semibold">Technical verification state</h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <SelectField name="state" label="State" defaultValue={a.verification_state} options={Object.entries(L.en.verification).map(([value, label]) => ({ value, label }))} />
          <TextField name="note" label="Verification note" hint="Required for “Verified”: what was checked, by whom." />
        </div>
        <SubmitButton pendingLabel="Saving…">Update state</SubmitButton>
      </ActionForm>
    </Card>
  );
}

export function NotesAndInfo({ b }: { b: ProjectBundle }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card aria-labelledby="sec-notes">
        <CardTitle id="sec-notes">Internal notes</CardTitle>
        <p className="mb-2 text-xs text-muted">Never visible to the customer.</p>
        <ActionForm action={addNoteAction}>
          <input type="hidden" name="assessmentId" value={b.assessment.id} />
          <TextAreaField name="body" label="New note" required rows={3} />
          <SubmitButton pendingLabel="Saving…">Add note</SubmitButton>
        </ActionForm>
        <ul className="mt-4 space-y-3 text-sm">
          {b.notes.length === 0 && <li className="text-muted">No notes yet.</li>}
          {b.notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-navy-100 bg-navy-50 p-3">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-xs text-muted">{n.author_name} · {fmtDateTime(n.created_at)}</p>
            </li>
          ))}
        </ul>
      </Card>
      <Card aria-labelledby="sec-info">
        <CardTitle id="sec-info">Information requests to customer</CardTitle>
        <ActionForm action={requestInfoAction}>
          <input type="hidden" name="projectId" value={b.project.id} />
          <TextAreaField name="message" label="What do you need from the customer?" required rows={3} hint="Visible to the customer. Moves SUBMITTED/ASSESSMENT projects to Needs info." />
          <SubmitButton pendingLabel="Sending…">Request information</SubmitButton>
        </ActionForm>
        <ul className="mt-4 space-y-3 text-sm">
          {b.infoRequests.length === 0 && <li className="text-muted">No requests sent.</li>}
          {b.infoRequests.map((i) => (
            <li key={i.id} className="rounded-lg border border-navy-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={i.status === "open" ? "warn" : i.status === "answered" ? "success" : "neutral"}>{lab("en", "infoStatus", i.status)}</Badge>
                <span className="text-xs text-muted">{fmtDateTime(i.created_at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{i.message}</p>
              {i.response && <p className="mt-2 whitespace-pre-wrap rounded bg-leaf-50 p-2"><span className="text-xs font-semibold">Customer reply ({fmtDateTime(i.answered_at)}):</span><br />{i.response}</p>}
              {i.status !== "closed" && (
                <ActionForm action={closeInfoRequestAction} className="mt-2">
                  <input type="hidden" name="infoRequestId" value={i.id} />
                  <ConfirmSubmit variant="secondary" size="sm" title="Close this request?" message="The request will be marked closed and no longer shown as awaiting the customer." confirmLabel="Close request" cancelLabel="Keep open">Close request</ConfirmSubmit>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
