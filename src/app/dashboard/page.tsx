import Link from "next/link";
import { Badge, Card, DemoBadge, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { requireCustomer } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { mnLab } from "@/i18n";
import { listCustomerProjects } from "@/lib/services/projects";

export const metadata = { title: "Миний төслүүд" };

export default async function DashboardHome() {
  const user = await requireCustomer();
  const projects = listCustomerProjects(getDb(), user);
  return (
    <>
      <PageHeader title="Миний төслүүд" description="Таны илгээсэн үнэлгээний хүсэлт, төслийн явц нэг дор." actions={<LinkButton href="/assess" variant="sun">Шинэ үнэлгээ</LinkButton>} />
      {projects.length === 0 ? (
        <EmptyState title="Танд одоогоор төсөл алга" action={<LinkButton href="/assess" variant="primary">Үнэлгээ эхлэх</LinkButton>}>
          Эрчим хүчний үнэлгээний хүсэлт илгээснээр төсөл энд харагдана.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Card className="hover:border-navy-700">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/dashboard/projects/${p.id}`} className="text-base font-semibold text-navy-900 underline">{p.reference}</Link>
                    <p className="text-sm text-muted">{p.org_name} · {mnLab("customerType", p.org_type)} · {p.province} · {mnLab("propertyType", p.property_type)}</p>
                    <p className="text-xs text-muted">Илгээсэн: {fmtDate(p.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.is_demo === 1 && <DemoBadge />}
                    {p.open_info > 0 && <Badge tone="warn">Танаас мэдээлэл хүлээж байна ({p.open_info})</Badge>}
                    <StatusBadge status={p.status} />
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
