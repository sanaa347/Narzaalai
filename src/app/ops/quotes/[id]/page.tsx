import { notFound } from "next/navigation";
import { QuoteForm } from "@/components/ops/catalog/QuoteForm";
import { quoteFormOptions } from "@/components/ops/catalog/quoteData";
import { ActionForm, ConfirmSubmit, FileField, SelectField, SubmitButton } from "@/components/ui/forms";
import { Alert, Badge, Card, CardTitle, DefList, DemoBadge, LinkButton, PageHeader, TableWrap, Td, Th } from "@/components/ui/primitives";
import { OfferBadge } from "@/components/ui/status";
import { archiveQuoteAction, setQuoteStatusAction, updateQuoteAction, uploadQuoteDocumentAction } from "@/lib/actions/ops-catalog";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { computeQuoteTotals } from "@/lib/domain/quote";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { L } from "@/i18n";
import { getQuoteDetail } from "@/lib/services/quotes";

export const metadata = { title: "Quotation" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  const db = getDb();
  const d = getQuoteDetail(db, actor, id);
  if (!d) notFound();
  const { quote: q, supplier, lines } = d;
  const locked = !!db.prepare("SELECT 1 FROM proposal_options o JOIN proposals p ON p.id = o.proposal_id WHERE o.quote_id = ? AND p.status IN ('published','approved')").get(id);
  const recomputed = computeQuoteTotals(lines.map((l) => ({ quantity: l.quantity, unitPriceMinor: l.unit_price_minor })), {
    installationMinor: q.installation_minor, deliveryMinor: q.delivery_minor, taxesMinor: q.taxes_minor, otherChargesMinor: q.other_charges_minor,
  });
  const consistent = recomputed.totalMinor === q.total_minor && recomputed.equipmentSubtotalMinor === q.equipment_subtotal_minor;
  const { suppliers, projects } = quoteFormOptions(db, actor);
  const cur = q.currency;
  const archived = !!q.archived_at;
  return (
    <>
      <PageHeader
        title={`Quotation ${q.reference}`} eyebrow="Quotation"
        badges={<><OfferBadge state={d.offer} lang="en" />{supplier.is_demo === 1 && <DemoBadge lang="en" />}{archived && <Badge tone="danger">Archived</Badge>}<Badge>{L.en.quoteStatus[q.status]}</Badge></>}
        actions={<><LinkButton href={`/ops/compare?ids=${q.id}`}>Compare</LinkButton><LinkButton href="/ops/quotes">All quotations</LinkButton></>}
      />
      {d.offer !== "confirmed_offer" && <Alert tone="warn" className="mb-4" title="Not a confirmed offer">{L.en.offer[d.offer]}. Only a received supplier quotation within its validity period counts as a confirmed offer.</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card aria-labelledby="meta">
          <CardTitle id="meta">Provenance and terms</CardTitle>
          <DefList items={[
            { label: "Supplier", value: <a className="underline" href={`/ops/suppliers/${supplier.id}`}>{supplier.company_name}</a> },
            { label: "Project", value: d.projectReference ? <a className="underline" href={`/ops/projects/${q.project_id}`}>{d.projectReference}</a> : "Not linked" },
            { label: "Source type", value: L.en.sourceType[q.source_type] },
            { label: "Source note", value: q.source_note },
            { label: "Quotation date", value: fmtDate(q.quote_date) },
            { label: "Received on", value: fmtDate(q.received_on) },
            { label: "Valid until", value: fmtDate(q.valid_until) },
            { label: "Stock", value: L.en.stock[q.stock_status] },
            { label: "Lead time", value: q.lead_time_days == null ? null : `${q.lead_time_days} days` },
            { label: "Installation availability", value: q.installation_availability },
            { label: "PV / battery / inverter", value: [q.pv_kwp && `${fmtNumber(q.pv_kwp, 2)} kWp`, q.battery_kwh != null && `${fmtNumber(q.battery_kwh, 2)} kWh`, q.inverter_kw && `${fmtNumber(q.inverter_kw, 2)} kW`].filter(Boolean).join(" · ") },
            { label: "Delivery assumptions", value: q.delivery_assumptions },
            { label: "Warranty terms", value: q.warranty_terms },
            { label: "Exclusions", value: q.exclusions },
          ]} />
        </Card>
        <div className="space-y-6">
          <Card aria-labelledby="doc">
            <CardTitle id="doc">Attached document</CardTitle>
            {d.document ? <p className="mb-3 text-sm"><a className="font-medium underline" href={`/api/documents/${d.document.id}`}>{d.document.original_name}</a></p> : <p className="mb-3 text-sm text-muted">No quotation document attached.</p>}
            <ActionForm action={uploadQuoteDocumentAction}>
              <input type="hidden" name="id" value={q.id} />
              <FileField name="file" label={d.document ? "Attach another document" : "Attach quotation document"} accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx" />
              <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
            </ActionForm>
          </Card>
          <Card aria-labelledby="stat">
            <CardTitle id="stat">Record status</CardTitle>
            <ActionForm action={setQuoteStatusAction}>
              <input type="hidden" name="id" value={q.id} />
              <SelectField name="status" label="Status" defaultValue={q.status} options={[{ value: "draft", label: "Draft" }, { value: "received", label: "Received" }, { value: "withdrawn", label: "Withdrawn" }]} />
              <SubmitButton pendingLabel="Saving…">Update status</SubmitButton>
            </ActionForm>
            <hr className="my-4 border-navy-100" />
            <ActionForm action={archiveQuoteAction}>
              <input type="hidden" name="id" value={q.id} />
              <input type="hidden" name="archive" value={archived ? "0" : "1"} />
              <ConfirmSubmit variant={archived ? "secondary" : "danger"} title={archived ? "Restore quotation?" : "Archive quotation?"} message="Archived quotations are hidden from lists but kept on record. A quotation in a published proposal cannot be archived." confirmLabel={archived ? "Restore" : "Archive"}>
                {archived ? "Restore quotation" : "Archive quotation"}
              </ConfirmSubmit>
            </ActionForm>
          </Card>
        </div>
      </div>

      <section className="mt-6" aria-labelledby="li">
        <h2 id="li" className="mb-2 text-base font-semibold">Line items ({cur})</h2>
        <TableWrap caption="Quotation line items">
          <thead><tr><Th>Category</Th><Th>Description</Th><Th>Manufacturer / model</Th><Th>Qty</Th><Th>Unit price</Th><Th>Line total</Th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}><Td>{L.en.productCategory[l.category]}</Td><Td>{l.description}</Td><Td>{[l.manufacturer, l.model].filter(Boolean).join(" ") || "—"}</Td><Td>{l.quantity}</Td><Td>{fmtMoney(l.unit_price_minor, cur)}</Td><Td>{fmtMoney(l.line_total_minor, cur)}</Td></tr>
            ))}
            <tr><Td colSpan={5} className="text-right font-medium">Equipment subtotal</Td><Td>{fmtMoney(q.equipment_subtotal_minor, cur)}</Td></tr>
            <tr><Td colSpan={5} className="text-right">Installation</Td><Td>{fmtMoney(q.installation_minor, cur)}</Td></tr>
            <tr><Td colSpan={5} className="text-right">Delivery</Td><Td>{fmtMoney(q.delivery_minor, cur)}</Td></tr>
            <tr><Td colSpan={5} className="text-right">Taxes</Td><Td>{fmtMoney(q.taxes_minor, cur)}</Td></tr>
            <tr><Td colSpan={5} className="text-right">Other charges</Td><Td>{fmtMoney(q.other_charges_minor, cur)}</Td></tr>
            <tr><Td colSpan={5} className="text-right text-base font-bold">Total</Td><Td className="font-bold">{fmtMoney(q.total_minor, cur)}</Td></tr>
          </tbody>
        </TableWrap>
        <p className="mt-2 text-xs text-muted">Totals are computed from integer minor units on the server. Unstated charges are recorded as 0 (not provided), not as confirmed free.{" "}
          {consistent ? "Stored totals match a fresh recomputation." : <strong className="text-danger-600">Stored totals differ from a fresh recomputation — investigate.</strong>}</p>
      </section>

      <section className="mt-8" aria-labelledby="edit">
        <h2 id="edit" className="mb-2 text-base font-semibold">Edit quotation</h2>
        {locked ? (
          <Alert tone="warn">This quotation is part of a published proposal and can no longer be edited. Withdraw the proposal first, or record a new quotation.</Alert>
        ) : (
          <Card><QuoteForm action={updateQuoteAction} suppliers={suppliers} projects={projects} quote={q} lines={lines} submitLabel="Save changes" /></Card>
        )}
      </section>
    </>
  );
}
