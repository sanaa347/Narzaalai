import Link from "next/link";
import { Badge, DemoBadge, EmptyState, TableWrap, Td, Th } from "@/components/ui/primitives";
import { FlagBadge, StatusBadge } from "@/components/ui/status";
import { fmtDate } from "@/lib/format";
import { L } from "@/i18n";
import type { OpsProjectRow } from "@/lib/services/projects";

export function ProjectTable({ rows, missing, emptyText }: { rows: (OpsProjectRow & { assessment_reference?: string })[]; missing: Map<string, number>; emptyText: string }) {
  if (!rows.length) return <EmptyState title="No projects match">{emptyText}</EmptyState>;
  return (
    <TableWrap caption="Projects">
      <thead>
        <tr><Th>Project / request ref</Th><Th>Customer</Th><Th>Site</Th><Th>Submitted</Th><Th>Status</Th><Th>Owner</Th><Th>Next action due</Th><Th>Missing info</Th><Th>Flags</Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-navy-50">
            <Td>
              <Link href={`/ops/projects/${r.id}`} className="font-semibold text-navy-900 underline">{r.reference}</Link>
              <div className="text-xs text-muted">{r.reference.replace(/^PRJ-/, "NZ-")}</div>
              {r.is_demo === 1 && <div className="mt-1"><DemoBadge lang="en" /></div>}
            </Td>
            <Td>
              <div className="font-medium">{r.org_name}</div>
              <div className="text-xs text-muted">{L.en.customerType[r.org_type]} · {r.contact_name ?? "—"} · {r.contact_phone ?? "—"}</div>
            </Td>
            <Td>{r.province}<div className="text-xs text-muted">{L.en.propertyType[r.property_type as keyof typeof L.en.propertyType] ?? r.property_type}</div></Td>
            <Td className="whitespace-nowrap">{fmtDate(r.created_at)}</Td>
            <Td><StatusBadge status={r.status} lang="en" /></Td>
            <Td>{r.assigned_name ?? <span className="text-muted">Unassigned</span>}</Td>
            <Td className="whitespace-nowrap">{fmtDate(r.next_action_due)}</Td>
            <Td>{missing.has(r.assessment_id) ? <Badge tone={missing.get(r.assessment_id)! > 0 ? "warn" : "success"}>{missing.get(r.assessment_id)} item(s)</Badge> : "—"}</Td>
            <Td><div className="flex flex-wrap gap-1">{r.flags.length ? r.flags.map((f) => <FlagBadge key={f} flag={f} lang="en" />) : <span className="text-muted">—</span>}</div></Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
