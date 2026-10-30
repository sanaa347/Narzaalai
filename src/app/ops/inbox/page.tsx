import Link from "next/link";
import { FilterBar } from "@/components/ops/project/FilterBar";
import { ProjectTable } from "@/components/ops/project/ProjectTable";
import { missingCounts, readFilters, type SP } from "@/components/ops/project/queries";
import { cx, PageHeader, Pagination } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { listOpsProjects, listStaffUsers, type OpsFilters } from "@/lib/services/projects";

export const metadata = { title: "Assessment inbox" };

const CHIPS = [
  { key: "SUBMITTED", label: "Submitted (new)", statuses: ["SUBMITTED"] },
  { key: "NEEDS_INFO", label: "Needs info", statuses: ["NEEDS_INFO"] },
  { key: "ASSESSMENT", label: "In assessment", statuses: ["ASSESSMENT"] },
  { key: "OPEN", label: "All open", statuses: ["SUBMITTED", "NEEDS_INFO", "ASSESSMENT"] },
];

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireStaff();
  const sp = await searchParams;
  const f = readFilters(sp);
  const chip = CHIPS.find((c) => c.key === f.status) ?? CHIPS[0];
  const db = getDb();
  const filters: OpsFilters = { q: f.q || undefined, owner: f.owner || undefined, attention: (f.attention || undefined) as OpsFilters["attention"], page: f.page, pageSize: 20, statuses: chip.statuses };
  const res = listOpsProjects(db, actor, filters);
  const missing = missingCounts(db, res.rows.map((r) => r.assessment_id));
  const params = { q: f.q, status: chip.key, owner: f.owner, attention: f.attention };
  return (
    <>
      <PageHeader title="Assessment inbox" description="Triage incoming requests: review submitted data, spot missing information, assign an owner." />
      <nav aria-label="Inbox status" className="mb-4 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <Link key={c.key} href={`/ops/inbox?${new URLSearchParams({ ...(f.q && { q: f.q }), ...(f.owner && { owner: f.owner }), ...(f.attention && { attention: f.attention }), status: c.key })}`}
            aria-current={c.key === chip.key ? "page" : undefined}
            className={cx("rounded-full border px-4 py-1.5 text-sm font-medium no-underline", c.key === chip.key ? "border-navy-900 bg-navy-900 text-white" : "border-navy-200 bg-white text-navy-900 hover:bg-navy-100")}>
            {c.label}
          </Link>
        ))}
      </nav>
      <FilterBar action="/ops/inbox" values={{ ...f, status: chip.key }} staff={listStaffUsers(db)} showStatus={false} hidden={{ status: chip.key }} />
      <ProjectTable rows={res.rows} missing={missing} emptyText={`Nothing in “${chip.label}” right now.`} />
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} basePath="/ops/inbox" params={params} />
    </>
  );
}
