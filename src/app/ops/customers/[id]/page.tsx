import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardTitle, DefList, DemoBadge, PageHeader, TableWrap, Td, Th } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { lab } from "@/i18n";
import { getOrganizationDetail } from "@/lib/services/customers";

export const metadata = { title: "Customer" };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  const d = getOrganizationDetail(getDb(), actor, id);
  if (!d) notFound();
  const { org } = d;
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/ops/customers" className="underline">← Customers</Link>}
        title={org.name}
        badges={<><Badge>{lab("en", "customerType", org.organization_type)}</Badge>{org.is_demo === 1 && <DemoBadge lang="en" />}</>}
        description={`Customer since ${fmtDate(org.created_at)}`}
      />
      <div className="space-y-6">
        <Card aria-labelledby="c-contact">
          <CardTitle id="c-contact">Contact</CardTitle>
          <DefList cols={3} items={[
            { label: "Contact name", value: org.contact_name }, { label: "Phone", value: org.contact_phone }, { label: "Email", value: org.contact_email },
            { label: "Documents", value: `${d.documentCounts.total} total, ${d.documentCounts.customerVisible} visible to customer` },
          ]} />
        </Card>
        <Card aria-labelledby="c-members">
          <CardTitle id="c-members">Account members</CardTitle>
          <TableWrap caption="Members">
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Phone</Th><Th>Role in organization</Th><Th>Account</Th></tr></thead>
            <tbody>
              {d.members.length === 0 && <tr><Td colSpan={5} className="text-muted">No members.</Td></tr>}
              {d.members.map((m) => (
                <tr key={m.user_id}><Td>{m.full_name}</Td><Td>{m.email}</Td><Td>{m.phone ?? "—"}</Td><Td>{m.member_role}</Td><Td>{m.status}</Td></tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
        <Card aria-labelledby="c-sites">
          <CardTitle id="c-sites">Sites</CardTitle>
          <TableWrap caption="Sites">
            <thead><tr><Th>Location</Th><Th>Property</Th><Th>Ownership</Th><Th>Area (m²)</Th><Th>Address</Th></tr></thead>
            <tbody>
              {d.sites.length === 0 && <tr><Td colSpan={5} className="text-muted">No sites.</Td></tr>}
              {d.sites.map((s) => (
                <tr key={s.id}>
                  <Td>{[s.province, s.district, s.city].filter(Boolean).join(", ")}</Td>
                  <Td>{lab("en", "propertyType", s.property_type)}</Td>
                  <Td>{lab("en", "ownership", s.ownership)}</Td>
                  <Td>{s.install_area_m2 ?? "—"}</Td>
                  <Td>{s.address ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
        <Card aria-labelledby="c-projects">
          <CardTitle id="c-projects">Projects</CardTitle>
          <TableWrap caption="Projects">
            <thead><tr><Th>Reference</Th><Th>Status</Th><Th>Created</Th></tr></thead>
            <tbody>
              {d.projects.length === 0 && <tr><Td colSpan={3} className="text-muted">No projects.</Td></tr>}
              {d.projects.map((p) => (
                <tr key={p.id}>
                  <Td><Link href={`/ops/projects/${p.id}`} className="font-semibold underline">{p.reference}</Link>{p.is_demo === 1 && <> <DemoBadge lang="en" /></>}</Td>
                  <Td><StatusBadge status={p.status} lang="en" /></Td>
                  <Td>{fmtDate(p.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      </div>
    </>
  );
}
