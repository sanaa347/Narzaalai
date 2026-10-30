import Link from "next/link";
import { ProjectTable } from "@/components/ops/project/ProjectTable";
import { missingCounts } from "@/components/ops/project/queries";
import { Alert, Card, CardTitle, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { L } from "@/i18n";
import { listOpsProjects, opsOverview } from "@/lib/services/projects";

export const metadata = { title: "Overview" };

function Stat({ href, label, value, tone }: { href: string; label: string; value: number; tone?: "warn" | "danger" }) {
  return (
    <Link href={href} className="block rounded-xl border border-navy-100 bg-white p-4 no-underline shadow-sm hover:border-navy-700">
      <p className={`text-3xl font-bold ${value > 0 && tone === "danger" ? "text-danger-600" : value > 0 && tone === "warn" ? "text-sun-800" : "text-navy-900"}`}>{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </Link>
  );
}

export default async function OpsHome() {
  const actor = await requireStaff();
  const db = getDb();
  const o = opsOverview(db);
  const attention = o.total ? listOpsProjects(db, actor, { pageSize: 100 }).rows.filter((r) => r.flags.length).slice(0, 10) : [];
  const newest = o.total ? listOpsProjects(db, actor, { pageSize: 8 }).rows : [];
  const missing = missingCounts(db, [...attention, ...newest].map((r) => r.assessment_id));

  return (
    <>
      <PageHeader title="Overview" description="Live counts from the project database." actions={<LinkButton href="/ops/inbox" variant="primary">Open assessment inbox</LinkButton>} />
      {o.demoProjects > 0 && (
        <Alert tone="warn" title="Demo data present" className="mb-6">
          {o.demoProjects} project(s) are fictional demonstration records (marked DEMO). Their suppliers, prices and documents are not real.
        </Alert>
      )}
      {o.total === 0 ? (
        <EmptyState title="No requests yet" action={<LinkButton href="/ops/suppliers" variant="primary">Add a supplier</LinkButton>}>
          Customer assessments will appear here as soon as they are submitted. You can prepare by adding suppliers and products.
        </EmptyState>
      ) : (
        <>
          <section aria-label="Key counts" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat href="/ops/projects" label="Total projects" value={o.total} />
            <Stat href="/ops/inbox?status=SUBMITTED" label="New requests (Submitted)" value={o.byStatus.find((s) => s.status === "SUBMITTED")?.n ?? 0} />
            <Stat href="/ops/projects?attention=overdue" label="Overdue next actions" value={o.overdue} tone="danger" />
            <Stat href="/ops/projects?attention=blocked" label="Blocked" value={o.blocked} tone="danger" />
            <Stat href="/ops/projects?attention=unassigned" label="Unassigned" value={o.unassigned} tone="warn" />
            <Stat href="/ops/projects?attention=open_info" label="Awaiting customer info" value={o.openInfo} tone="warn" />
            <Stat href="/ops/quotes" label="Expired supplier quotations" value={o.expiredQuotes} tone="warn" />
            <Stat href="/ops/projects?q=" label="Created today" value={o.newToday} />
          </section>

          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Card aria-labelledby="by-status">
              <CardTitle id="by-status">Projects by status</CardTitle>
              <ul className="space-y-1 text-sm">
                {o.byStatus.map((s) => (
                  <li key={s.status} className="flex justify-between gap-2">
                    <Link href={`/ops/projects?status=${s.status}`} className="underline">{L.en.status[s.status]}</Link>
                    <span className="font-semibold">{s.n}</span>
                  </li>
                ))}
              </ul>
              <hr className="my-4 border-navy-100" />
              <ul className="space-y-1 text-sm">
                <li className="flex justify-between"><Link href="/ops/suppliers" className="underline">Suppliers</Link><span className="font-semibold">{o.suppliers}</span></li>
                <li className="flex justify-between"><Link href="/ops/products" className="underline">Products</Link><span className="font-semibold">{o.products}</span></li>
                <li className="flex justify-between"><Link href="/ops/quotes" className="underline">Quotations</Link><span className="font-semibold">{o.quotes}</span></li>
              </ul>
            </Card>
            <div className="min-w-0 space-y-6">
              <section aria-labelledby="att">
                <h2 id="att" className="mb-2 text-base font-semibold text-navy-900">Needs attention</h2>
                <ProjectTable rows={attention} missing={missing} emptyText="No overdue, blocked, unassigned or awaiting-customer projects." />
              </section>
              <section aria-labelledby="new">
                <h2 id="new" className="mb-2 text-base font-semibold text-navy-900">Newest requests</h2>
                <ProjectTable rows={newest} missing={missing} emptyText="No requests." />
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
