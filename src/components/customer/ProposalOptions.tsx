import { ActionForm, SubmitButton, ConfirmSubmit, TextAreaField } from "@/components/ui/forms";
import { Alert, Badge, Card, CardTitle, DemoBadge } from "@/components/ui/primitives";
import { OfferBadge } from "@/components/ui/status";
import { approveProposalAction } from "@/lib/actions/customer";
import { localDate } from "@/lib/domain/dates";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from "@/lib/format";
import { mnLab } from "@/i18n";
import type { ProposalView } from "@/lib/services/proposals";
import type { ProjectStatus } from "@/lib/domain/status";

const BLOCKER_MN: Record<string, string> = {
  withdrawn: "Энэ саналыг нийлүүлэгч эсвэл манай баг татгалзсан.",
  not_received: "Энэ санал хараахан баталгаажаагүй байна.",
  expired: "Энэ саналын хүчинтэй хугацаа дууссан. Батлахын өмнө шинэ санал шаардлагатай.",
  no_validity_date: "Саналын хүчинтэй хугацаа заагаагүй тул батлах боломжгүй.",
  not_a_supplier_quotation: "Ойролцоо эсвэл жишээ үнийг батлах боломжгүй.",
};
const NOTE_MN: Record<string, string> = {
  mixed_currency: "Саналууд өөр өөр валютаар байна. Бид валют хөрвүүлээгүй тул нийт дүнг шууд харьцуулж болохгүй.",
  not_all_confirmed: "Зарим хувилбар хүчинтэй, албан ёсны санал биш (хугацаа дууссан, ойролцоо эсвэл жишээ).",
  single_option: "Энэ саналд зөвхөн нэг хувилбар байна.",
  price_not_only_criterion: "Үнэ нь цорын ганц шалгуур биш. Хүчин чадал, тоног төхөөрөмж, баталгаа, хугацаа, хамаарахгүй зүйлийг хамт харна уу.",
};
const UNKNOWN_MN: Record<string, string> = {
  pvKwp: "панелийн хүчин чадал", batteryKwh: "батарейн багтаамж", inverterKw: "инвертерийн хүчин чадал", leadTimeDays: "нийлүүлэх хугацаа",
  stockStatus: "нөөцийн байдал", installationAvailability: "суурилуулалтын боломж", warrantyTerms: "баталгааны нөхцөл", validUntil: "хүчинтэй хугацаа", exclusions: "хамаарахгүй зүйл",
};
const unk = <span className="text-muted">Мэдэгдэхгүй</span>;

export function ProposalOptions({ view, projectStatus }: { view: ProposalView; projectStatus: ProjectStatus }) {
  const { proposal, options, comparison } = view;
  const canApprove = proposal.status === "published" && projectStatus === "PROPOSAL_READY";
  const today = localDate();
  return (
    <Card aria-labelledby={`p-${proposal.id}`}>
      <CardTitle id={`p-${proposal.id}`} actions={<Badge tone={proposal.status === "approved" ? "success" : "info"}>{mnLab("proposalStatus", proposal.status)}</Badge>}>{proposal.title}</CardTitle>
      {proposal.summary && <p className="mb-3 whitespace-pre-line text-sm">{proposal.summary}</p>}
      <div className="mb-4 space-y-2">
        {comparison.notes.map((n) => <Alert key={n} tone={n === "price_not_only_criterion" || n === "single_option" ? "info" : "warn"}>{NOTE_MN[n]}</Alert>)}
      </div>
      {proposal.status === "approved" && (
        <Alert tone="success" className="mb-4" title="Санал батлагдсан">
          Сонгосон хувилбар: {options.find((o) => o.option.quote_id === proposal.approved_quote_id)?.option.label ?? "—"} · {proposal.approved_by_label} · {fmtDateTime(proposal.approved_at)}.
          Батлалт нь тоног төхөөрөмж худалдан авсан гэсэн үг биш — худалдан авалт, суурилуулалт, туршилт дараагийн үе шатуудад тусад нь бүртгэгдэнэ.
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
        {options.map((o) => {
          const col = comparison.columns.find((c) => c.input.id === o.quote.id);
          if (!col) return null;
          const q = o.quote;
          const cur = q.currency;
          const expired = q.validUntil != null && q.validUntil < today;
          const approved = proposal.approved_quote_id === q.id;
          return (
            <article key={o.option.id} className={`flex flex-col rounded-xl border p-4 ${approved ? "border-leaf-600 bg-leaf-50" : "border-navy-100 bg-white"}`}>
              <h3 className="text-lg font-semibold text-navy-900">{o.option.label}</h3>
              {o.option.customer_summary && <p className="mt-1 text-sm text-muted">{o.option.customer_summary}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{q.supplierName}</span>{q.supplierIsDemo && <DemoBadge />}<OfferBadge state={col.state} />
              </div>
              <p className="mt-1 text-xs text-muted">Санал: {fmtDate(q.quoteDate)} · Хүчинтэй: {q.validUntil ? fmtDate(q.validUntil) : "заагаагүй"}{expired && " (хугацаа дууссан)"}</p>
              <p className="mt-3 text-2xl font-bold text-navy-950">{fmtMoney(q.totalMinor, cur)}</p>
              <dl className="mt-1 space-y-0.5 text-xs text-muted">
                {([["Тоног төхөөрөмж", q.equipmentSubtotalMinor], ["Суурилуулалт", q.installationMinor], ["Хүргэлт", q.deliveryMinor], ["Татвар", q.taxesMinor], ["Бусад", q.otherChargesMinor]] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt>{k}</dt><dd>{fmtMoney(v, cur)}</dd></div>
                ))}
              </dl>
              {col.costPerKwpMinor != null && <p className="mt-1 text-xs text-muted">Мэдээллийн зорилгоор: {fmtMoney(col.costPerKwpMinor, cur)} / кВп (үнэлгээ биш)</p>}
              <dl className="mt-3 space-y-1 text-sm">
                <Row k="Панел" v={q.pvKwp != null ? `${fmtNumber(q.pvKwp, 2)} кВп` : null} />
                <Row k="Батарей" v={q.batteryKwh != null ? `${fmtNumber(q.batteryKwh, 2)} кВт·ц` : null} />
                <Row k="Инвертер" v={q.inverterKw != null ? `${fmtNumber(q.inverterKw, 2)} кВт` : null} />
                <Row k="Нөөц" v={q.stockStatus !== "unknown" ? mnLab("stock", q.stockStatus) : null} />
                <Row k="Нийлүүлэх хугацаа" v={q.leadTimeDays != null ? `${q.leadTimeDays} өдөр` : null} />
                <Row k="Суурилуулалтын боломж" v={q.installationAvailability} />
                <Row k="Хүргэлтийн нөхцөл" v={q.deliveryAssumptions ?? null} />
                <Row k="Баталгаа" v={q.warrantyTerms} />
              </dl>
              <div className="mt-3 rounded-lg bg-sun-100/60 p-2 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-sun-800">Хамаарахгүй зүйл</p><p className="whitespace-pre-line">{q.exclusions ?? "Заагаагүй"}</p></div>
              {o.lines.length > 0 && (
                <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium text-navy-900">Тоног төхөөрөмжийн жагсаалт ({o.lines.length})</summary>
                  <ul className="mt-2 space-y-1 text-xs">{o.lines.map((l, i) => <li key={i}>{l.quantity} × {l.description}{l.manufacturer || l.model ? ` (${[l.manufacturer, l.model].filter(Boolean).join(" ")})` : ""} — {fmtMoney(l.line_total_minor, cur)}</li>)}</ul>
                </details>
              )}
              {col.unknownFields.length > 0 && <p className="mt-3 text-xs text-muted">Мэдэгдэхгүй: {col.unknownFields.map((f) => UNKNOWN_MN[f] ?? f).join(", ")}</p>}
              <div className="mt-auto pt-4">
                {approved ? <Badge tone="success">Таны сонгосон хувилбар</Badge> : canApprove && (
                  o.approvalBlocker ? (
                    <div><button type="button" disabled className="min-h-11 w-full cursor-not-allowed rounded-lg border border-navy-200 bg-navy-100 px-4 text-sm font-medium text-muted">Батлах боломжгүй</button><p className="mt-1 text-xs text-danger-800">{BLOCKER_MN[o.approvalBlocker] ?? "Энэ хувилбарыг одоогоор батлах боломжгүй."}</p></div>
                  ) : (
                    <ActionForm action={approveProposalAction}>
                      <input type="hidden" name="proposalId" value={proposal.id} />
                      <input type="hidden" name="quoteId" value={q.id} />
                      <TextAreaField name="note" label="Тэмдэглэл (заавал биш)" rows={2} />
                      <ConfirmSubmit variant="primary" title={`«${o.option.label}» хувилбарыг батлах уу?`} confirmLabel="Тийм, батлах" cancelLabel="Болих"
                        message="Батлалт нь тоног төхөөрөмж худалдан авсан гэсэн үг биш. Худалдан авалт, суурилуулалт, туршилтыг дараагийн үе шатанд тусад нь бүртгэнэ. Баталсан хувилбарыг та дангаар өөрчлөх боломжгүй.">Энэ хувилбарыг батлах</ConfirmSubmit>
                      <span className="sr-only"><SubmitButton>Батлах</SubmitButton></span>
                    </ActionForm>
                  )
                )}
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right">{v ?? unk}</dd></div>;
}
