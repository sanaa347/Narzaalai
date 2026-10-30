import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetsPanel } from "@/components/customer/AssetsPanel";
import { DocumentsPanel } from "@/components/customer/DocumentsPanel";
import { InfoRequests } from "@/components/customer/InfoRequests";
import { PlanView } from "@/components/customer/PlanView";
import { ProgressStepper } from "@/components/customer/ProgressStepper";
import { ProposalOptions } from "@/components/customer/ProposalOptions";
import { SiteEnergySummary } from "@/components/customer/SiteEnergySummary";
import { Timeline } from "@/components/customer/Timeline";
import { Alert, Card, CardTitle, DemoBadge, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { requireCustomer } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { fmtDate, parseJson } from "@/lib/format";
import { statusInfo } from "@/i18n";
import { getProjectBundle } from "@/lib/services/projects";
import { listProposalsForCustomer } from "@/lib/services/proposals";
import type { PrelimResult } from "@/lib/solar/prelim";

export const metadata = { title: "Төслийн самбар" };

export default async function ProjectDashboard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const user = await requireCustomer();
  const { id } = await params;
  const { submitted } = await searchParams;
  const db = getDb();
  const b = getProjectBundle(db, user, id);
  if (!b) notFound();
  const { project, assessment, site, energy } = b;
  const info = statusInfo[project.status];
  const plan = parseJson<PrelimResult | null>(assessment.results, null);
  const proposals = listProposalsForCustomer(db, user, id);
  const openInfo = b.infoRequests.filter((i) => i.status === "open");
  const missing = parseJson<string[]>(assessment.missing_data, []);

  return (
    <>
      <PageHeader
        eyebrow={`Хүсэлтийн дугаар ${assessment.reference}`}
        title={project.reference}
        badges={<><StatusBadge status={project.status} />{project.is_demo === 1 && <DemoBadge />}</>}
        description={`${b.org.name} · ${site.province}`}
      />

      {submitted === "1" && (
        <Alert tone="success" title={`Хүсэлтийг хүлээн авлаа — ${assessment.reference}`} className="mb-6" role="status">
          <p>Энэ дугаараа хадгална уу. Манай баг мэдээллийг хянаж, шаардлагатай бол тантай холбогдоно. Нийлүүлэгчийн үнийн санал авах нь дараагийн үе шат.</p>
          <p className="mt-1 font-semibold">Доорх тооцоо нь урьдчилсан тооцоо бөгөөд үнийн санал биш.</p>
        </Alert>
      )}

      <Card className="mb-6" aria-labelledby="now-h">
        <CardTitle id="now-h">Одоогийн байдал ба дараагийн алхам</CardTitle>
        <p className="text-sm">{info.explain}</p>
        <p className="mt-2 rounded-lg bg-sun-100 px-3 py-2 text-sm font-medium text-navy-950">Дараагийн алхам: {info.next}</p>
        {project.scheduled_install_date && (
          <p className="mt-2 text-sm text-muted">Төлөвлөсөн суурилуулалтын огноо: {fmtDate(project.scheduled_install_date)} (баталгаат амлалт биш; нийлүүлэлт, нөхцөлөөс хамаарна).</p>
        )}
        {b.assignedName && <p className="mt-1 text-xs text-muted">Хариуцсан ажилтан: {b.assignedName}</p>}
      </Card>

      <div className="mb-6"><ProgressStepper status={project.status} resumeStatus={project.resume_status} /></div>

      {openInfo.length > 0 && <div className="mb-6"><InfoRequests items={b.infoRequests} /></div>}

      <div className="space-y-6">
        {proposals.length > 0 && (
          <section aria-labelledby="prop-h">
            <h2 id="prop-h" className="mb-3 text-lg font-semibold text-navy-900">Санал</h2>
            <div className="space-y-6">{proposals.map((v) => <ProposalOptions key={v.proposal.id} view={v} projectStatus={project.status} />)}</div>
          </section>
        )}

        <section aria-labelledby="plan-h">
          <h2 id="plan-h" className="mb-3 text-lg font-semibold text-navy-900">Урьдчилсан төлөвлөгөө</h2>
          {plan ? <PlanView plan={plan} calcVersion={assessment.calc_version} /> : <Alert tone="info">Урьдчилсан тооцоо хадгалагдаагүй байна.</Alert>}
          {missing.length > 0 && <p className="mt-2 text-xs text-muted">Дутуу мэдээллийг нэмэхийг хүсвэл манай ажилтантай холбогдоно уу.</p>}
        </section>

        <SiteEnergySummary site={site} energy={energy} assessment={assessment} />

        {b.infoRequests.length > 0 && openInfo.length === 0 && <InfoRequests items={b.infoRequests} />}

        <DocumentsPanel projectId={project.id} documents={b.documents} canUpload={!["CANCELLED", "REJECTED"].includes(project.status)} />
        <AssetsPanel assets={b.assets} />

        <Card aria-labelledby="tl-h">
          <CardTitle id="tl-h">Төслийн цагийн хэлхээ</CardTitle>
          <Timeline events={b.events} />
        </Card>
      </div>
      <p className="mt-8"><Link href="/dashboard" className="text-sm underline">← Миний төслүүд</Link></p>
    </>
  );
}
