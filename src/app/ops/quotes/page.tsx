import Link from "next/link";
import { Badge, buttonClass, DemoBadge, EmptyState, LinkButton, PageHeader, TableWrap, Td, Th } from "@/components/ui/primitives";
import { OfferBadge } from "@/components/ui/status";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/format";
import { L } from "@/i18n";
import { listQuotes } from "@/lib/services/quotes";
import { listSuppliers } from "@/lib/services/suppliers";

export const metadata = { title: "Quotations" };
const CONTROL = "mt-1 min-h-11 w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-normal";

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ q?: string; supplier?: string; project?: string; archived?: string }> }) {
  const actor = await requireStaff();
  const sp = await searchParams;
  const db = getDb();
  const includeArchived = sp.archived === "1";
  const rows = listQuotes(db, actor, { q: sp.q, supplierId: sp.supplier || undefined, projectId: sp.project || undefined, includeArchived });
  const suppliers = listSuppliers(db, actor, { includeArchived: true });
  const projects = db.prepare("SELECT DISTINCT p.id, p.reference FROM projects p JOIN quotes q ON q.project_id = p.id ORDER BY p.reference").all() as { id: string; reference: string }[];
  return (
    <>
      <PageHeader title="Quotations" description="Dated supplier quotations and indicative prices. Only a received, unexpired supplier quotation is a confirmed offer." actions={<LinkButton href="/ops/quotes/new" variant="primary">Add quotation</LinkButton>} />
      <form method="get" action="/ops/quotes" role="search" className="mb-4 grid gap-3 rounded-xl border border-navy-100 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto_auto]">
        <label className="text-xs font-semibold text-muted">Search<input name="q" defaultValue={sp.q ?? ""} placeholder="Reference, supplier, project" className={CONTROL} /></label>
        <label className="text-xs font-semibold text-muted">Supplier<select name="supplier" defaultValue={sp.supplier ?? ""} className={CONTROL}><option value="">All</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}</select></label>
        <label className="text-xs font-semibold text-muted">Project<select name="project" defaultValue={sp.project ?? ""} className={CONTROL}><option value="">All</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.reference}</option>)}</select></label>
        <label className="flex min-h-11 items-end gap-2 pb-2 text-sm"><input type="checkbox" name="archived" value="1" defaultChecked={includeArchived} className="h-5 w-5 accent-navy-900" /> Archived</label>
        <div className="flex items-end gap-2"><button type="submit" className={buttonClass("primary")}>Apply</button><Link href="/ops/quotes" className={buttonClass("ghost")}>Reset</Link></div>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No quotations found" action={<LinkButton href="/ops/quotes/new" variant="primary">Add quotation</LinkButton>}>Record real supplier quotations here, or clear the filters.</EmptyState>
      ) : (
        <form method="get" action="/ops/compare">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <button type="submit" className={buttonClass("primary", "sm")}>Compare selected (2–4)</button>
            <span className="text-xs text-muted">Tick the quotations to compare side by side. Comparison does not rank by price.</span>
          </div>
          <TableWrap caption="Quotations">
            <thead><tr><Th>Compare</Th><Th>Reference</Th><Th>Supplier</Th><Th>Project</Th><Th>Dated</Th><Th>Valid until</Th><Th>Offer state</Th><Th>Source</Th><Th>Total</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-navy-50">
                  <Td><input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.reference} for comparison`} className="h-5 w-5 accent-navy-900" /></Td>
                  <Td><Link href={`/ops/quotes/${r.id}`} className="font-semibold underline">{r.reference}</Link>{r.archived_at && <div><Badge tone="danger">Archived</Badge></div>}</Td>
                  <Td>{r.supplier_name}{r.supplier_is_demo === 1 && <div className="mt-1"><DemoBadge lang="en" /></div>}</Td>
                  <Td>{r.project_reference ?? <span className="text-muted">Not linked</span>}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(r.quote_date)}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(r.valid_until)}</Td>
                  <Td><OfferBadge state={r.offer} lang="en" /><div className="mt-1 text-xs text-muted">{L.en.quoteStatus[r.status]}</div></Td>
                  <Td>{L.en.sourceType[r.source_type]}</Td>
                  <Td className="whitespace-nowrap font-medium">{fmtMoney(r.total_minor, r.currency)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </form>
      )}
    </>
  );
}
