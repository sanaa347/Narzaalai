import Link from "next/link";
import { notFound } from "next/navigation";
import { SupplierForm } from "@/components/ops/catalog/SupplierForm";
import { ActionForm, ConfirmSubmit } from "@/components/ui/forms";
import { Alert, Badge, Card, CardTitle, DemoBadge, EmptyState, LinkButton, PageHeader, TableWrap, Td, Th } from "@/components/ui/primitives";
import { OfferBadge } from "@/components/ui/status";
import { archiveSupplierAction, updateSupplierAction } from "@/lib/actions/ops-catalog";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/format";
import { L } from "@/i18n";
import { listProducts } from "@/lib/services/products";
import { listQuotes } from "@/lib/services/quotes";
import { getSupplier } from "@/lib/services/suppliers";

export const metadata = { title: "Supplier" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  const db = getDb();
  const s = getSupplier(db, actor, id);
  if (!s) notFound();
  const products = listProducts(db, actor, { supplierId: id });
  const quotes = listQuotes(db, actor, { supplierId: id });
  const archived = !!s.archived_at;
  return (
    <>
      <PageHeader
        title={s.company_name} eyebrow="Supplier"
        badges={<>{s.is_demo === 1 && <DemoBadge lang="en" />}{archived && <Badge tone="danger">Archived</Badge>}<Badge tone={s.verification_state === "evidence_recorded" ? "success" : "neutral"}>{L.en.supplierVerification[s.verification_state]}</Badge></>}
        actions={<LinkButton href="/ops/suppliers">All suppliers</LinkButton>}
      />
      {s.is_demo === 1 && <Alert tone="warn" className="mb-4">Fictional demonstration supplier. It cannot issue real quotations.</Alert>}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card aria-labelledby="edit"><CardTitle id="edit">Details</CardTitle><SupplierForm action={updateSupplierAction} supplier={s} submitLabel="Save changes" /></Card>
        <div className="space-y-6">
          <Card aria-labelledby="arch">
            <CardTitle id="arch">{archived ? "Restore" : "Archive"}</CardTitle>
            <p className="mb-3 text-sm text-muted">Archiving hides the supplier from new work; its quotations and history stay on record.</p>
            <ActionForm action={archiveSupplierAction}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="archive" value={archived ? "0" : "1"} />
              <ConfirmSubmit title={archived ? "Restore supplier?" : "Archive supplier?"} message={archived ? "The supplier becomes available again (its status stays inactive until you change it)." : "The supplier is hidden from new quotations. Existing records are kept."} confirmLabel={archived ? "Restore" : "Archive"} cancelLabel="Cancel" variant={archived ? "secondary" : "danger"}>
                {archived ? "Restore supplier" : "Archive supplier"}
              </ConfirmSubmit>
            </ActionForm>
          </Card>
        </div>
      </div>
      <section className="mt-8" aria-labelledby="prods">
        <div className="mb-2 flex items-center justify-between"><h2 id="prods" className="text-base font-semibold">Products</h2><LinkButton href="/ops/products/new" size="sm">Add product</LinkButton></div>
        {products.length === 0 ? <EmptyState title="No products recorded for this supplier" /> : (
          <TableWrap caption="Products">
            <thead><tr><Th>Category</Th><Th>Manufacturer</Th><Th>Model</Th><Th>Indicative price</Th></tr></thead>
            <tbody>{products.map((p) => (
              <tr key={p.id}><Td>{L.en.productCategory[p.category]}</Td><Td>{p.manufacturer}</Td><Td>{p.model}</Td>
                <Td>{p.price_minor !== null && p.source && p.last_checked_on ? <>{fmtMoney(p.price_minor, p.currency)}<div className="text-xs text-muted">indicative · checked {fmtDate(p.last_checked_on)}</div></> : "—"}</Td></tr>
            ))}</tbody>
          </TableWrap>
        )}
      </section>
      <section className="mt-8" aria-labelledby="qs">
        <div className="mb-2 flex items-center justify-between"><h2 id="qs" className="text-base font-semibold">Quotations</h2><LinkButton href="/ops/quotes/new" size="sm">Add quotation</LinkButton></div>
        {quotes.length === 0 ? <EmptyState title="No quotations from this supplier" /> : (
          <TableWrap caption="Quotations">
            <thead><tr><Th>Reference</Th><Th>Project</Th><Th>Dated</Th><Th>Valid until</Th><Th>Offer</Th><Th>Total</Th></tr></thead>
            <tbody>{quotes.map((q) => (
              <tr key={q.id}><Td><Link href={`/ops/quotes/${q.id}`} className="font-semibold underline">{q.reference}</Link></Td><Td>{q.project_reference ?? "—"}</Td><Td>{fmtDate(q.quote_date)}</Td><Td>{fmtDate(q.valid_until)}</Td><Td><OfferBadge state={q.offer} lang="en" /></Td><Td>{fmtMoney(q.total_minor, q.currency)}</Td></tr>
            ))}</tbody>
          </TableWrap>
        )}
      </section>
    </>
  );
}
