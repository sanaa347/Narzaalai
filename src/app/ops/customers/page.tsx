import Link from "next/link";
import { Badge, DemoBadge, EmptyState, PageHeader, TableWrap, Td, Th } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { lab } from "@/i18n";
import { listOrganizations } from "@/lib/services/projects";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff();
  const { q } = await searchParams;
  const rows = listOrganizations(getDb(), q);
  return (
    <>
      <PageHeader title="Customers" description="Households and businesses that have submitted a request." />
      <form method="get" action="/ops/customers" role="search" aria-label="Search customers" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-navy-100 bg-white p-3">
        <label className="min-w-0 flex-1 text-xs font-semibold text-muted">Search
          <input name="q" defaultValue={q ?? ""} placeholder="Name, contact, phone, email…" className="mt-1 min-h-11 w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm font-normal" />
        </label>
        <button type="submit" className={buttonClass("primary")}>Search</button>
        <Link href="/ops/customers" className={buttonClass("ghost")}>Reset</Link>
      </form>
      {rows.length === 0 ? (
        <EmptyState title={q ? "No customers match" : "No customers yet"}>{q ? "Try a different search." : "Customer records are created automatically when an assessment request is submitted."}</EmptyState>
      ) : (
        <TableWrap caption="Customers">
          <thead><tr><Th>Name</Th><Th>Type</Th><Th>Contact</Th><Th>Sites</Th><Th>Projects</Th><Th>Created</Th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="hover:bg-navy-50">
                <Td><Link href={`/ops/customers/${o.id}`} className="font-semibold underline">{o.name}</Link>{o.is_demo === 1 && <div className="mt-1"><DemoBadge lang="en" /></div>}</Td>
                <Td><Badge>{lab("en", "customerType", o.organization_type)}</Badge></Td>
                <Td>{o.contact_name ?? "—"}<div className="text-xs text-muted">{o.contact_phone ?? "—"} · {o.contact_email ?? "—"}</div></Td>
                <Td>{o.site_count}</Td>
                <Td>{o.project_count}</Td>
                <Td className="whitespace-nowrap">{fmtDate(o.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
