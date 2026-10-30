import Link from "next/link";
import type { ReactNode } from "react";
import { ActionBar } from "@/components/ops/catalog/CompareBits";
import { Alert, Badge, buttonClass, DemoBadge, EmptyState, LinkButton, PageHeader, TableWrap, Td, Th } from "@/components/ui/primitives";
import { OfferBadge } from "@/components/ui/status";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { buildComparison } from "@/lib/domain/compare";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { L } from "@/i18n";
import { getComparisonInputs, listQuotes } from "@/lib/services/quotes";

export const metadata = { title: "Compare quotations" };
const MAX = 4;
const DASH = <span className="text-muted">—</span>;

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const actor = await requireStaff();
  const { ids: raw } = await searchParams;
  const ids = [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean))];
  const db = getDb();
  const inputs = getComparisonInputs(db, ids.slice(0, MAX));

  if (inputs.length === 0) {
    const rows = listQuotes(db, actor).filter((r) => r.status !== "withdrawn");
    return (
      <>
        <PageHeader title="Compare quotations" description="Side-by-side comparison of capacity, equipment, scope, warranty, lead time and exclusions. Price is shown, never used to rank." />
        {rows.length === 0 ? (
          <EmptyState title="No quotations to compare yet" action={<LinkButton href="/ops/quotes/new" variant="primary">Add quotation</LinkButton>}>Record at least two quotations for the same project, then compare them here.</EmptyState>
        ) : (
          <form method="get" action="/ops/compare" className="space-y-3">
            <p className="text-sm text-muted">Choose 2–{MAX} quotations. Quotations in different currencies are shown side by side but never converted.</p>
            <TableWrap caption="Choose quotations">
              <thead><tr><Th>Pick</Th><Th>Reference</Th><Th>Supplier</Th><Th>Project</Th><Th>Offer</Th><Th>Total</Th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}><Td><input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.reference}`} className="h-5 w-5 accent-navy-900" /></Td><Td>{r.reference}</Td><Td>{r.supplier_name}</Td><Td>{r.project_reference ?? "—"}</Td><Td><OfferBadge state={r.offer} lang="en" /></Td><Td>{fmtMoney(r.total_minor, r.currency)}</Td></tr>
              ))}</tbody>
            </TableWrap>
            <button type="submit" className={buttonClass("primary")}>Compare selected</button>
          </form>
        )}
      </>
    );
  }

  const cmp = buildComparison(inputs);
  const cols = cmp.columns;
  const row = (label: string, cell: (c: (typeof cols)[number]) => ReactNode) => (
    <tr key={label}><th scope="row" className="whitespace-nowrap border-b border-navy-100 bg-navy-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">{label}</th>
      {cols.map((c) => <Td key={c.input.id} className="min-w-44">{cell(c) ?? DASH}</Td>)}</tr>
  );
  const num = (v: number | null, unit: string) => (v == null ? null : `${fmtNumber(v, 2)} ${unit}`);
  const text = (v: string | null) => (v && v.trim() ? <span className="whitespace-pre-wrap">{v}</span> : null);

  return (
    <>
      <PageHeader title="Compare quotations" description="Not a ranking: price sits beside capacity, equipment, scope, warranty, lead time and exclusions." actions={<LinkButton href="/ops/compare">Change selection</LinkButton>} />
      {ids.length > MAX && <Alert tone="info" className="mb-3">Only the first {MAX} selected quotations are shown.</Alert>}
      {cmp.mixedCurrency && <Alert tone="warn" title="Different currencies" className="mb-3">These quotations use different currencies. Amounts are shown in their own currency and are not converted, so totals are not directly comparable.</Alert>}
      {cmp.notes.includes("not_all_confirmed") && <Alert tone="warn" className="mb-3">Some columns are not confirmed offers (expired, undated, indicative, demo or withdrawn). Treat their prices as unconfirmed.</Alert>}
      {cmp.notes.includes("single_option") && <Alert tone="info" className="mb-3">Only one quotation selected. <Link href="/ops/quotes" className="underline">Pick more from the list</Link>.</Alert>}
      <TableWrap caption="Quotation comparison">
        <thead>
          <tr><Th>&nbsp;</Th>{cols.map((c) => (
            <th key={c.input.id} scope="col" className="border-b border-navy-100 bg-navy-50 px-3 py-2 text-left align-top">
              <Link href={`/ops/quotes/${c.input.id}`} className="font-semibold underline">{c.input.reference}</Link>
              <div className="text-sm font-normal">{c.input.supplierName}</div>
              <div className="mt-1 flex flex-wrap gap-1"><OfferBadge state={c.state} lang="en" />{c.input.supplierIsDemo && <DemoBadge lang="en" />}</div>
            </th>))}</tr>
        </thead>
        <tbody>
          {row("Source", (c) => L.en.sourceType[c.input.sourceType])}
          {row("Quotation date", (c) => fmtDate(c.input.quoteDate))}
          {row("Valid until", (c) => (c.input.validUntil ? fmtDate(c.input.validUntil) : null))}
          {row("PV capacity", (c) => num(c.input.pvKwp, "kWp"))}
          {row("Battery", (c) => num(c.input.batteryKwh, "kWh"))}
          {row("Inverter", (c) => num(c.input.inverterKw, "kW"))}
          {row("Equipment", (c) => (c.input.lines.length ? <ul className="space-y-1 text-xs">{c.input.lines.map((l, i) => <li key={i}>{l.quantity}× {L.en.productCategory[l.category as keyof typeof L.en.productCategory] ?? l.category}: {[l.manufacturer, l.model].filter(Boolean).join(" ") || "model not stated"}</li>)}</ul> : null))}
          {row("Equipment subtotal", (c) => fmtMoney(c.input.equipmentSubtotalMinor, c.input.currency))}
          {row("Installation", (c) => fmtMoney(c.input.installationMinor, c.input.currency))}
          {row("Delivery", (c) => fmtMoney(c.input.deliveryMinor, c.input.currency))}
          {row("Taxes", (c) => fmtMoney(c.input.taxesMinor, c.input.currency))}
          {row("Other charges", (c) => fmtMoney(c.input.otherChargesMinor, c.input.currency))}
          {row("Total", (c) => <strong>{fmtMoney(c.input.totalMinor, c.input.currency)}</strong>)}
          {row("Total per kWp (info only)", (c) => (c.costPerKwpMinor == null ? null : fmtMoney(c.costPerKwpMinor, c.input.currency)))}
          {row("Stock", (c) => (c.input.stockStatus === "unknown" ? null : L.en.stock[c.input.stockStatus]))}
          {row("Lead time", (c) => (c.input.leadTimeDays == null ? null : `${c.input.leadTimeDays} days`))}
          {row("Installation availability", (c) => text(c.input.installationAvailability))}
          {row("Warranty", (c) => text(c.input.warrantyTerms))}
          {row("Exclusions", (c) => text(c.input.exclusions))}
          {row("Missing data", (c) => (c.unknownFields.length ? <Badge tone="warn">{c.unknownFields.length} unknown</Badge> : <Badge tone="success">Complete</Badge>))}
        </tbody>
      </TableWrap>
      <ActionBar />
    </>
  );
}
