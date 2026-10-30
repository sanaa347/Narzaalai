import Link from "next/link";
import { Badge, buttonClass, DemoBadge, EmptyState, LinkButton, PageHeader, TableWrap, Td, Th } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { L } from "@/i18n";
import { listSuppliers } from "@/lib/services/suppliers";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string }> }) {
  const actor = await requireStaff();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const includeArchived = sp.archived === "1";
  const rows = listSuppliers(getDb(), actor, { q: q || undefined, includeArchived });
  return (
    <>
      <PageHeader title="Suppliers" description="Supplier and installer directory. Verification reflects recorded evidence only." actions={<LinkButton href="/ops/suppliers/new" variant="primary">Add supplier</LinkButton>} />
      <form method="get" action="/ops/suppliers" role="search" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-navy-100 bg-white p-3">
        <label className="min-w-56 flex-1 text-xs font-semibold text-muted">Search
          <input name="q" defaultValue={q} placeholder="Name, area, brand, offering…" className="mt-1 min-h-11 w-full rounded-lg border border-navy-200 px-3 py-2 text-sm font-normal" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="archived" value="1" defaultChecked={includeArchived} className="h-5 w-5 accent-navy-900" /> Show archived</label>
        <button type="submit" className={buttonClass("primary")}>Apply</button>
        <Link href="/ops/suppliers" className={buttonClass("ghost")}>Reset</Link>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No suppliers found" action={<LinkButton href="/ops/suppliers/new" variant="primary">Add supplier</LinkButton>}>
          Add the companies that provide quotations or installation. Clear the filters if you expected results.
        </EmptyState>
      ) : (
        <TableWrap caption="Suppliers">
          <thead><tr><Th>Company</Th><Th>Contact</Th><Th>Service area</Th><Th>Installer</Th><Th>Evidence</Th><Th>Status</Th><Th>Products</Th><Th>Quotes</Th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-navy-50">
                <Td>
                  <Link href={`/ops/suppliers/${s.id}`} className="font-semibold underline">{s.company_name}</Link>
                  <div className="mt-1 flex flex-wrap gap-1">{s.is_demo === 1 && <DemoBadge lang="en" />}{s.archived_at && <Badge tone="danger">Archived</Badge>}</div>
                </Td>
                <Td>{s.contact_name ?? "—"}<div className="text-xs text-muted">{s.phone ?? ""} {s.email ?? ""}</div></Td>
                <Td>{s.service_area ?? "—"}</Td>
                <Td><Badge tone={s.installer_capability === "verified" ? "success" : s.installer_capability === "claimed" ? "warn" : "neutral"}>{L.en.installerCapability[s.installer_capability]}</Badge></Td>
                <Td><Badge tone={s.verification_state === "evidence_recorded" ? "success" : "neutral"}>{L.en.supplierVerification[s.verification_state]}</Badge></Td>
                <Td><Badge tone={s.status === "active" ? "success" : "neutral"}>{s.status === "active" ? "Active" : "Inactive"}</Badge></Td>
                <Td>{s.product_count}</Td>
                <Td>{s.quote_count}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
