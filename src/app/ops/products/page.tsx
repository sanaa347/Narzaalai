import Link from "next/link";
import { ActionForm, ConfirmSubmit } from "@/components/ui/forms";
import { Badge, buttonClass, DemoBadge, EmptyState, LinkButton, PageHeader, TableWrap, Td, Th } from "@/components/ui/primitives";
import { archiveProductAction } from "@/lib/actions/ops-catalog";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/format";
import { L, options } from "@/i18n";
import { listProducts } from "@/lib/services/products";
import { listSuppliers } from "@/lib/services/suppliers";

export const metadata = { title: "Products" };
const CONTROL = "mt-1 min-h-11 w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-normal";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; supplier?: string; archived?: string }> }) {
  const actor = await requireStaff();
  const sp = await searchParams;
  const db = getDb();
  const includeArchived = sp.archived === "1";
  const rows = listProducts(db, actor, { q: sp.q, category: sp.category || undefined, supplierId: sp.supplier || undefined, includeArchived });
  const suppliers = listSuppliers(db, actor);
  return (
    <>
      <PageHeader title="Product catalogue" description="Equipment records. Prices here are indicative reference values, not supplier quotations." actions={<LinkButton href="/ops/products/new" variant="primary">Add product</LinkButton>} />
      <form method="get" action="/ops/products" role="search" className="mb-4 grid gap-3 rounded-xl border border-navy-100 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto_auto]">
        <label className="text-xs font-semibold text-muted">Search<input name="q" defaultValue={sp.q ?? ""} placeholder="Manufacturer, model, specs" className={CONTROL} /></label>
        <label className="text-xs font-semibold text-muted">Category
          <select name="category" defaultValue={sp.category ?? ""} className={CONTROL}><option value="">All</option>{options("en", "productCategory").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-muted">Supplier
          <select name="supplier" defaultValue={sp.supplier ?? ""} className={CONTROL}><option value="">All</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}</select>
        </label>
        <label className="flex min-h-11 items-end gap-2 pb-2 text-sm"><input type="checkbox" name="archived" value="1" defaultChecked={includeArchived} className="h-5 w-5 accent-navy-900" /> Archived</label>
        <div className="flex items-end gap-2"><button type="submit" className={buttonClass("primary")}>Apply</button><Link href="/ops/products" className={buttonClass("ghost")}>Reset</Link></div>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No products found" action={<LinkButton href="/ops/products/new" variant="primary">Add product</LinkButton>}>Add equipment records, or clear the filters.</EmptyState>
      ) : (
        <TableWrap caption="Products">
          <thead><tr><Th>Category</Th><Th>Product</Th><Th>Supplier</Th><Th>Indicative price</Th><Th>Verification</Th><Th>Action</Th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const priced = p.price_minor !== null && !!p.source && !!p.last_checked_on;
              return (
                <tr key={p.id}>
                  <Td>{L.en.productCategory[p.category]}</Td>
                  <Td><div className="font-medium">{p.manufacturer} {p.model}</div><div className="text-xs text-muted">{p.specs ?? ""}</div>
                    <div className="mt-1 flex gap-1">{p.is_demo === 1 && <DemoBadge lang="en" />}{p.archived_at && <Badge tone="danger">Archived</Badge>}</div></Td>
                  <Td>{p.supplier_name ?? "—"}</Td>
                  <Td>{priced ? (<><div className="font-medium">{fmtMoney(p.price_minor, p.currency)}</div>
                    <Badge tone="warn" title="Not a supplier quotation">Unverified indicative price</Badge>
                    <div className="mt-1 text-xs text-muted">Source: {p.source} · checked {fmtDate(p.last_checked_on)}</div></>) : <span className="text-muted">No price on record</span>}</Td>
                  <Td><Badge tone={p.verification_state === "independently_verified" ? "success" : "neutral"}>{L.en.productVerification[p.verification_state]}</Badge></Td>
                  <Td>
                    <ActionForm action={archiveProductAction} className="space-y-0">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="archive" value={p.archived_at ? "0" : "1"} />
                      <ConfirmSubmit size="sm" variant={p.archived_at ? "secondary" : "danger"} title={p.archived_at ? "Restore product?" : "Archive product?"} message="Archived products are hidden from the default list; records referencing them are kept." confirmLabel={p.archived_at ? "Restore" : "Archive"}>{p.archived_at ? "Restore" : "Archive"}</ConfirmSubmit>
                    </ActionForm>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
