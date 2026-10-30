import { FilterBar } from "@/components/ops/project/FilterBar";
import { ProjectTable } from "@/components/ops/project/ProjectTable";
import { missingCounts, readFilters, toOpsFilters, type SP } from "@/components/ops/project/queries";
import { PageHeader, Pagination } from "@/components/ui/primitives";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { listOpsProjects, listStaffUsers } from "@/lib/services/projects";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireStaff();
  const f = readFilters(await searchParams);
  const db = getDb();
  const res = listOpsProjects(db, actor, toOpsFilters(f));
  const missing = missingCounts(db, res.rows.map((r) => r.assessment_id));
  return (
    <>
      <PageHeader title="Projects" description="Every request and project, from submission to in-service. Filter by status, owner or attention flag." />
      <FilterBar action="/ops/projects" values={f} staff={listStaffUsers(db)} />
      <ProjectTable rows={res.rows} missing={missing} emptyText="Try clearing the filters. New customer requests appear here automatically." />
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} basePath="/ops/projects" params={{ q: f.q, status: f.status, owner: f.owner, attention: f.attention }} />
    </>
  );
}
