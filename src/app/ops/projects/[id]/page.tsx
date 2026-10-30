import Link from "next/link";
import { notFound } from "next/navigation";
import { AssessmentResult, CustomerSite, EnergyProfile, NotesAndInfo } from "@/components/ops/project-detail/Overview";
import { ProposalsSection } from "@/components/ops/project-detail/Proposals";
import { AssetsSection, DocumentsSection, TimelineSection } from "@/components/ops/project-detail/Records";
import { ScheduleSummary, WorkflowPanel } from "@/components/ops/project-detail/Workflow";
import { Card, DemoBadge, PageHeader } from "@/components/ui/primitives";
import { FlagBadge, StatusBadge } from "@/components/ui/status";
import { requireStaff } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { attentionFlags } from "@/lib/domain/attention";
import { COMMISSIONING_DOC_TYPES, getProjectBundle, listStaffUsers } from "@/lib/services/projects";
import { listProposalsForOps } from "@/lib/services/proposals";
import { listQuotes } from "@/lib/services/quotes";
import { listSuppliers } from "@/lib/services/suppliers";

export const metadata = { title: "Project" };

const NAV = [
  ["sec-customer", "Customer & site"], ["sec-assess", "Assessment"], ["sec-notes", "Notes & info"], ["sec-status", "Workflow"],
  ["sec-proposals", "Proposals"], ["sec-docs", "Documents"], ["sec-assets", "Equipment & service"], ["sec-timeline", "Timeline"],
] as const;

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;
  const db = getDb();
  const b = getProjectBundle(db, actor, id);
  if (!b) notFound();
  const staff = listStaffUsers(db);
  const proposals = listProposalsForOps(db, id);
  const quotes = listQuotes(db, actor, { projectId: id });
  const suppliers = listSuppliers(db, actor);
  const flags = attentionFlags({
    status: b.project.status, nextActionDue: b.project.next_action_due, blockedReason: b.project.blocked_reason, assignedTo: b.project.assigned_to,
    openInfoRequests: b.infoRequests.filter((i) => i.status === "open").length,
    hasCommissioningEvidence: b.documents.some((d) => (COMMISSIONING_DOC_TYPES as readonly string[]).includes(d.doc_type)),
  });
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/ops/projects" className="underline">← Projects</Link>}
        title={b.project.reference}
        badges={<><span data-testid="project-status" data-status={b.project.status}><StatusBadge status={b.project.status} lang="en" /></span>{b.project.is_demo === 1 && <DemoBadge lang="en" />}{flags.map((f) => <FlagBadge key={f} flag={f} lang="en" />)}</>}
        description={<>Customer: <Link href={`/ops/customers/${b.org.id}`} className="underline">{b.org.name}</Link> · Assessment {b.assessment.reference} · Owner: {b.assignedName ?? "Unassigned"}</>}
      />
      <nav aria-label="Sections" className="mb-6 flex flex-wrap gap-2 text-sm">
        {NAV.map(([href, label]) => <a key={href} href={`#${href}`} className="rounded-full border border-navy-200 bg-white px-3 py-1 no-underline hover:bg-navy-100">{label}</a>)}
      </nav>
      <div className="space-y-6">
        <Card><ScheduleSummary b={b} /></Card>
        <CustomerSite b={b} />
        <EnergyProfile b={b} />
        <AssessmentResult b={b} />
        <NotesAndInfo b={b} />
        <WorkflowPanel b={b} staff={staff} />
        <ProposalsSection b={b} proposals={proposals} quotes={quotes} />
        <DocumentsSection b={b} />
        <AssetsSection b={b} suppliers={suppliers} staff={staff} />
        <TimelineSection b={b} />
      </div>
    </>
  );
}
