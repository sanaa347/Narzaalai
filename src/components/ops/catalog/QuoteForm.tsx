"use client";

import { useState, type FormEvent } from "react";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField, type FormAction } from "@/components/ui/forms";
import { Alert, buttonClass } from "@/components/ui/primitives";
import { L, options } from "@/i18n";
import type { QuoteLineRow, QuoteRow } from "@/lib/db/types";
import { CURRENCIES, exponentOf, formatMoney, isCurrency, parseMoney, type Currency } from "@/lib/domain/money";
import { computeQuoteTotals } from "@/lib/domain/quote";
import type { FormState } from "@/lib/actions/state";

interface Line { category: string; manufacturer: string; model: string; description: string; quantity: string; unitPrice: string }
const blank = (): Line => ({ category: "pv_module", manufacturer: "", model: "", description: "", quantity: "1", unitPrice: "" });
const CATEGORY_OPTIONS = Object.entries(L.en.productCategory).map(([value, label]) => ({ value, label }));
const dec = (minor: number, cur: Currency) => (minor / 10 ** exponentOf(cur)).toFixed(exponentOf(cur));

const SOURCE_HELP: Record<string, string> = {
  supplier_quotation: "A real, dated quotation received from the supplier. Requires the received date and how it was received. Only these can become confirmed offers.",
  indicative: "An unverified price (price list, phone estimate). Always shown as indicative; never as a current offer.",
  demo: "Fictional sample figures for the demonstration. Only allowed for demo suppliers and always labelled DEMO.",
};

function preview(root: HTMLElement | null, lines: Line[], cur: Currency) {
  const val = (n: string) => (root?.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value ?? "").trim();
  const m = (n: string) => (val(n) === "" ? 0 : parseMoney(val(n), cur));
  const parsed = lines.map((l) => ({ q: Number(l.quantity), p: parseMoney(l.unitPrice, cur) }));
  const charges = ["installation", "delivery", "taxes", "otherCharges"].map(m);
  if (parsed.some((l) => !Number.isInteger(l.q) || l.q <= 0 || l.p === null) || charges.some((c) => c === null)) return null;
  const t = computeQuoteTotals(parsed.map((l) => ({ quantity: l.q, unitPriceMinor: l.p as number })), {
    installationMinor: charges[0] as number, deliveryMinor: charges[1] as number, taxesMinor: charges[2] as number, otherChargesMinor: charges[3] as number,
  });
  return t;
}

export function QuoteForm({
  action, suppliers, projects, quote, lines: initialLines, defaultProjectId, submitLabel,
}: {
  action: FormAction;
  suppliers: { id: string; name: string; isDemo: boolean }[];
  projects: { id: string; label: string }[];
  quote?: QuoteRow;
  lines?: QuoteLineRow[];
  defaultProjectId?: string;
  submitLabel: string;
}) {
  const startCur: Currency = quote && isCurrency(quote.currency) ? quote.currency : "MNT";
  const [cur, setCur] = useState<Currency>(startCur);
  const [source, setSource] = useState<string>(quote?.source_type ?? "supplier_quotation");
  const [lines, setLines] = useState<Line[]>(
    initialLines?.length
      ? initialLines.map((l) => ({ category: l.category, manufacturer: l.manufacturer ?? "", model: l.model ?? "", description: l.description, quantity: String(l.quantity), unitPrice: dec(l.unit_price_minor, startCur) }))
      : [blank()],
  );
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);

  const wrapped: FormAction = async (prev, fd): Promise<FormState> => {
    const r = await action(prev, fd);
    const errs: Record<string, string> = {};
    if (r.ok === false) for (const [k, v] of Object.entries(r.fieldErrors ?? {})) if (k.startsWith("lines")) errs[k] = v;
    setLineErrors(errs);
    return r;
  };
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const totals = preview(rootEl, lines, cur);
  void tick;
  const serial = JSON.stringify(lines.map((l) => ({ category: l.category, manufacturer: l.manufacturer, model: l.model, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })));
  const input = "min-h-11 w-full rounded-lg border border-navy-200 bg-white px-2 py-2 text-sm";
  const d = (v: number | null | undefined) => (v == null ? "" : String(v));
  const q = quote;

  return (
    <div ref={setRootEl} onInput={(e: FormEvent) => { if ((e.target as HTMLElement).closest("[data-charge]")) setTick((t) => t + 1); }}>
      <ActionForm action={wrapped}>
        {q && <input type="hidden" name="id" value={q.id} />}
        <input type="hidden" name="lines" value={serial} />
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold">Quotation</legend>
          <SelectField name="supplierId" label="Supplier" required placeholder="Choose…" defaultValue={q?.supplier_id} options={suppliers.map((s) => ({ value: s.id, label: s.name + (s.isDemo ? " (DEMO)" : "") }))} />
          <SelectField name="projectId" label="Project (optional)" placeholder="— not linked —" defaultValue={q?.project_id ?? defaultProjectId} options={projects.map((p) => ({ value: p.id, label: p.label }))} hint="Quotations must be linked to a project before they can go into a proposal." />
          <TextField name="reference" label="Supplier's quotation reference" required defaultValue={q?.reference} />
          <SelectField name="currency" label="Currency" required defaultValue={cur} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <TextField name="quoteDate" type="date" label="Quotation date" required defaultValue={q?.quote_date} />
          <TextField name="receivedOn" type="date" label="Received on" defaultValue={q?.received_on} />
          <TextField name="validUntil" type="date" label="Valid until" defaultValue={q?.valid_until} hint="Without a validity date the offer cannot be treated as current." />
          <SelectField name="status" label="Record status" defaultValue={q?.status === "draft" ? "draft" : "received"} options={[{ value: "received", label: "Received" }, { value: "draft", label: "Draft" }]} />
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">Source of this price</legend>
          <SelectField name="sourceType" label="Source type" required defaultValue={source} options={options("en", "sourceType")} />
          <Alert tone="info">{SOURCE_HELP[source]}</Alert>
          <TextAreaField name="sourceNote" label="Source note" rows={2} defaultValue={q?.source_note} hint="How it was received / where the figure comes from." />
        </fieldset>
        <SourceWatcher onChange={setSource} />

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Equipment line items ({cur})</legend>
          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={i} className="rounded-lg border border-navy-100 p-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs font-semibold text-muted">Category
                    <select aria-label={`Line ${i + 1} category`} className={input} value={l.category} onChange={(e) => setLine(i, { category: e.target.value })}>{CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                  <label className="text-xs font-semibold text-muted">Manufacturer<input className={input} value={l.manufacturer} onChange={(e) => setLine(i, { manufacturer: e.target.value })} /></label>
                  <label className="text-xs font-semibold text-muted">Model<input className={input} value={l.model} onChange={(e) => setLine(i, { model: e.target.value })} /></label>
                  <label className="text-xs font-semibold text-muted">Description *<input className={input} value={l.description} required onChange={(e) => setLine(i, { description: e.target.value })} /></label>
                  <label className="text-xs font-semibold text-muted">Quantity *<input className={input} inputMode="numeric" value={l.quantity} required onChange={(e) => setLine(i, { quantity: e.target.value })} /></label>
                  <label className="text-xs font-semibold text-muted">Unit price ({cur}) *<input className={input} inputMode="decimal" value={l.unitPrice} required onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></label>
                  <div className="flex items-end">
                    <button type="button" className={buttonClass("secondary", "sm")} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove line {i + 1}</button>
                  </div>
                </div>
                {Object.entries(lineErrors).filter(([k]) => k.startsWith(`lines.${i}.`) || k === "lines").map(([k, v]) => <p key={k} className="mt-1 text-sm font-medium text-danger-600">{v}</p>)}
              </div>
            ))}
          </div>
          <button type="button" className={buttonClass("secondary", "sm", "mt-3")} onClick={() => setLines((ls) => [...ls, blank()])}>Add line</button>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-charge>
          <legend className="mb-2 text-sm font-semibold">Other charges ({cur}) — only if stated by the supplier</legend>
          <TextField name="installation" label="Installation" inputMode="decimal" defaultValue={q ? dec(q.installation_minor, startCur) : ""} />
          <TextField name="delivery" label="Delivery" inputMode="decimal" defaultValue={q ? dec(q.delivery_minor, startCur) : ""} />
          <TextField name="taxes" label="Taxes" inputMode="decimal" defaultValue={q ? dec(q.taxes_minor, startCur) : ""} />
          <TextField name="otherCharges" label="Other charges" inputMode="decimal" defaultValue={q ? dec(q.other_charges_minor, startCur) : ""} />
        </fieldset>
        <CurrencyWatcher onChange={setCur} />

        <div role="status" className="rounded-lg border border-navy-200 bg-navy-50 p-3 text-sm">
          <p className="font-semibold">Preview (the server recalculates and stores the final totals)</p>
          {totals ? <p>Equipment subtotal {formatMoney(totals.equipmentSubtotalMinor, cur)} · Total {formatMoney(totals.totalMinor, cur)}</p> : <p className="text-muted">Enter valid quantities and prices to see totals.</p>}
        </div>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-semibold">System size (as stated in the quotation)</legend>
          <TextField name="pvKwp" label="PV capacity (kWp)" inputMode="decimal" defaultValue={d(q?.pv_kwp)} />
          <TextField name="batteryKwh" label="Battery (kWh)" inputMode="decimal" defaultValue={d(q?.battery_kwh)} />
          <TextField name="inverterKw" label="Inverter (kW)" inputMode="decimal" defaultValue={d(q?.inverter_kw)} />
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold">Availability and terms</legend>
          <SelectField name="stockStatus" label="Stock / availability" defaultValue={q?.stock_status ?? "unknown"} options={options("en", "stock")} />
          <TextField name="leadTimeDays" label="Delivery lead time (days)" inputMode="numeric" defaultValue={d(q?.lead_time_days)} />
          <TextField name="installationAvailability" label="Installation availability" defaultValue={q?.installation_availability} className="sm:col-span-2" />
          <TextAreaField name="deliveryAssumptions" label="Delivery assumptions" hint="What the delivery cost and lead time assume: destination, who unloads, incoterm. Leave empty if the supplier did not say." defaultValue={q?.delivery_assumptions} className="sm:col-span-2" />
          <TextAreaField name="warrantyTerms" label="Warranty terms (as quoted)" defaultValue={q?.warranty_terms} className="sm:col-span-2" />
          <TextAreaField name="exclusions" label="Exclusions" defaultValue={q?.exclusions} className="sm:col-span-2" />
        </fieldset>
        <SubmitButton variant="primary" pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </ActionForm>
    </div>
  );
}

/** Mirrors the (uncontrolled) select values into state so the labels and preview follow them. */
function SourceWatcher({ onChange }: { onChange: (v: string) => void }) {
  return <ChangeBridge name="sourceType" onChange={onChange} />;
}
function CurrencyWatcher({ onChange }: { onChange: (v: Currency) => void }) {
  return <ChangeBridge name="currency" onChange={(v) => isCurrency(v) && onChange(v)} />;
}
function ChangeBridge({ name, onChange }: { name: string; onChange: (v: string) => void }) {
  return (
    <span
      hidden
      ref={(el) => {
        const sel = el?.closest("form")?.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
        if (!sel || (sel as HTMLSelectElement & { __b?: boolean }).__b) return;
        (sel as HTMLSelectElement & { __b?: boolean }).__b = true;
        sel.addEventListener("change", () => onChange(sel.value));
      }}
    />
  );
}
