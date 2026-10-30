import Link from "next/link";
import { Alert, Badge, Card, CardTitle, EmptyState, LinkButton, TableWrap, Td, Th } from "@/components/ui/primitives";
import { OfferBadge } from "@/components/ui/status";
import { ActionForm, CheckField, ConfirmSubmit, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/forms";
import { approveOnBehalfAction, createProposalAction, publishProposalAction, withdrawProposalAction } from "@/lib/actions/ops-projects";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { lab } from "@/i18n";
import type { ProposalView } from "@/lib/services/proposals";
import type { QuoteListRow } from "@/lib/services/quotes";
import type { ProjectBundle } from "@/lib/services/projects";

const NOTE_TEXT: Record<string, string> = {
  price_not_only_criterion: "Price is not the only criterion: compare capacity, equipment, scope, warranty, lead time and exclusions.",
  mixed_currency: "Options use different currencies; totals are not directly comparable.",
  not_all_confirmed: "Some options are not confirmed, current supplier offers (expired, indicative, demo or no validity date).",
  single_option: "Only one option: nothing to compare.",
};
const FIELD_TEXT: Record<string, string> = {
  pvKwp: "PV kWp", batteryKwh: "battery kWh", inverterKw: "inverter kW", leadTimeDays: "lead time", stockStatus: "stock", installationAvailability: "installation availability",
  warrantyTerms: "warranty", validUntil: "valid-until date", exclusions: "exclusions",
};

function ProposalCard({ v, b }: { v: ProposalView; b: ProjectBundle }) {
  const p = v.proposal;
  const tone = p.status === "approved" ? "success" : p.status === "published" ? "sun" : p.status === "withdrawn" ? "danger" : "neutral";
  const ids = v.options.map((o) => o.quote.id).join(",");
  return (
    <Card as="article" aria-labelledby={`prop-${p.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`prop-${p.id}`} className="font-semibold text-navy-900">{p.title}</h3>
        <Badge tone={tone}>{lab("en", "proposalStatus", p.status)}</Badge>
      </div>
      {p.summary && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{p.summary}</p>}
      {p.status === "approved" && <Alert tone="success" className="mt-3" title="Approved">By {p.approved_by_label ?? "—"} on {fmtDate(p.approved_at)}. Approval is not a purchase. {p.approval_note ?? ""}</Alert>}
      <div className="mt-3">
        <TableWrap caption={`Options in ${p.title}`}>
          <thead><tr><Th>Option</Th><Th>Supplier / ref</Th><Th>Offer state</Th><Th>Total</Th><Th>PV kWp</Th><Th>Battery kWh</Th><Th>Lead time</Th><Th>Valid until</Th><Th>Unknown fields</Th></tr></thead>
          <tbody>
            {v.comparison.columns.map((c, i) => {
              const o = v.options[i];
              return (
                <tr key={c.input.id} className={p.approved_quote_id === c.input.id ? "bg-leaf-50" : undefined}>
                  <Td className="font-medium">{o.option.label}{p.approved_quote_id === c.input.id && <> <Badge tone="success">Chosen</Badge></>}</Td>
                  <Td>{c.input.supplierName}<div className="text-xs text-muted">{c.input.reference}</div></Td>
                  <Td><OfferBadge state={c.state} lang="en" />{o.approvalBlocker && <div className="mt-1 max-w-[16rem] text-xs text-danger-600">{o.approvalBlocker}</div>}</Td>
                  <Td className="whitespace-nowrap">{fmtMoney(c.input.totalMinor, c.input.currency)}{c.lowestConfirmedTotal && <div className="text-xs text-muted">lowest confirmed total (not a ranking)</div>}</Td>
                  <Td>{fmtNumber(c.input.pvKwp, 2)}</Td>
                  <Td>{fmtNumber(c.input.batteryKwh, 2)}</Td>
                  <Td>{c.input.leadTimeDays != null ? `${c.input.leadTimeDays} d` : "—"}</Td>
                  <Td>{fmtDate(c.input.validUntil)}</Td>
                  <Td className="text-xs text-muted">{c.unknownFields.map((f) => FIELD_TEXT[f] ?? f).join(", ") || "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </div>
      <ul className="mt-2 list-disc pl-5 text-xs text-muted">{v.comparison.notes.map((n) => <li key={n}>{NOTE_TEXT[n]}</li>)}</ul>
      <div className="mt-3 flex flex-wrap items-start gap-3">
        {ids && <LinkButton href={`/ops/compare?ids=${ids}`} size="sm">Open full comparison</LinkButton>}
        {v.options.map((o) => <Link key={o.quote.id} href={`/ops/quotes/${o.quote.id}`} className="self-center text-sm underline">{o.option.label}: quotation</Link>)}
      </div>

      {p.status === "draft" && (
        <ActionForm action={publishProposalAction} className="mt-4">
          <input type="hidden" name="proposalId" value={p.id} />
          <ConfirmSubmit variant="primary" title="Publish to the customer?" message="The customer will see these options and can approve one. Publishing is not an approval or a sale." confirmLabel="Publish proposal">Publish to customer</ConfirmSubmit>
        </ActionForm>
      )}
      {p.status === "published" && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ActionForm action={approveOnBehalfAction}>
            <h4 className="text-sm font-semibold">Record customer approval on their behalf</h4>
            <p className="text-xs text-muted">Only when the customer approved outside the app (phone, in person). Approving is not a purchase.</p>
            <input type="hidden" name="proposalId" value={p.id} />
            <SelectField name="quoteId" label="Option approved by the customer" required placeholder="Choose…" options={v.options.map((o) => ({ value: o.quote.id, label: `${o.option.label} — ${o.quote.supplierName}` }))} />
            <TextAreaField name="note" label="How/when was approval given?" required rows={2} />
            <ConfirmSubmit variant="primary" title="Record approval on the customer's behalf?" message="This is written to the project history under your name and moves the project to Approved. It is not a purchase order." confirmLabel="Record approval">Record approval</ConfirmSubmit>
          </ActionForm>
          <ActionForm action={withdrawProposalAction}>
            <h4 className="text-sm font-semibold">Withdraw proposal</h4>
            <input type="hidden" name="proposalId" value={p.id} />
            <TextAreaField name="note" label="Reason" required rows={2} />
            <ConfirmSubmit variant="danger" title="Withdraw this proposal?" message="The customer will no longer be able to approve it." confirmLabel="Withdraw">Withdraw proposal</ConfirmSubmit>
          </ActionForm>
        </div>
      )}
      {b.project.is_demo === 1 && <p className="mt-3 text-xs text-muted">Demo project: demo quotations cannot be approved as real offers.</p>}
    </Card>
  );
}

export function ProposalsSection({ b, proposals, quotes }: { b: ProjectBundle; proposals: ProposalView[]; quotes: QuoteListRow[] }) {
  const usable = quotes.filter((q) => q.status === "received");
  const drafts = quotes.filter((q) => q.status === "draft");
  return (
    <section aria-labelledby="sec-proposals" className="space-y-4">
      <h2 id="sec-proposals" className="text-lg font-bold text-navy-900">Quotations &amp; proposals</h2>
      <Card>
        <CardTitle actions={<LinkButton href={`/ops/quotes/new?projectId=${b.project.id}`} size="sm" variant="sun">Add quotation for this project</LinkButton>}>Quotations linked to this project</CardTitle>
        {quotes.length === 0 ? <p className="text-sm text-muted">No quotations recorded yet. Request quotes from suppliers, then enter them as received (never invent prices).</p> : (
          <TableWrap caption="Project quotations">
            <thead><tr><Th>Reference</Th><Th>Supplier</Th><Th>Status</Th><Th>Offer state</Th><Th>Total</Th><Th>Valid until</Th></tr></thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <Td><Link href={`/ops/quotes/${q.id}`} className="font-medium underline">{q.reference}</Link></Td>
                  <Td>{q.supplier_name}</Td>
                  <Td>{lab("en", "quoteStatus", q.status)}</Td>
                  <Td><OfferBadge state={q.offer} lang="en" /></Td>
                  <Td className="whitespace-nowrap">{fmtMoney(q.total_minor, q.currency)}</Td>
                  <Td>{fmtDate(q.valid_until)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {proposals.length === 0 ? <EmptyState title="No proposals yet">Select received quotations below to create a draft proposal.</EmptyState> : proposals.map((v) => <ProposalCard key={v.proposal.id} v={v} b={b} />)}

      <Card aria-labelledby="sec-newprop">
        <CardTitle id="sec-newprop">Create proposal from selected quotations</CardTitle>
        {usable.length === 0 ? (
          <p className="text-sm text-muted">{drafts.length ? "Only draft quotations exist; mark a quotation as Received first." : "Link at least one received quotation to this project first."}</p>
        ) : (
          <ActionForm action={createProposalAction}>
            <input type="hidden" name="projectId" value={b.project.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField name="title" label="Proposal title" required defaultValue="Solar system options" />
              <TextAreaField name="summary" label="Summary for the customer" rows={2} />
            </div>
            <fieldset className="space-y-3">
              <legend className="mb-1 text-sm font-medium">Quotations to include</legend>
              {usable.map((q) => (
                <div key={q.id} className="rounded-lg border border-navy-100 p-3">
                  <CheckField name="quoteId" value={q.id} label={<span>{q.supplier_name} · {q.reference} · {fmtMoney(q.total_minor, q.currency)} <OfferBadge state={q.offer} lang="en" /></span>} />
                  <div className="grid gap-2 md:grid-cols-2">
                    <TextField name={`label_${q.id}`} label="Option label" defaultValue={`${q.supplier_name} — ${q.reference}`} />
                    <TextField name={`summary_${q.id}`} label="Customer summary (optional)" />
                  </div>
                </div>
              ))}
            </fieldset>
            <SubmitButton pendingLabel="Creating…">Create draft proposal</SubmitButton>
          </ActionForm>
        )}
      </Card>
    </section>
  );
}
