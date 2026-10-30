import { Alert, Badge, Card, CardTitle, TableWrap, Td, Th } from "@/components/ui/primitives";
import { fmtNumber } from "@/lib/format";
import { L, mnLab } from "@/i18n";
import type { PrelimResult } from "@/lib/solar/prelim";

const STAGES = [
  "Урьдчилсан тооцоо",
  "Техникийн үнэлгээ (баталгаажихыг хүлээж буй)",
  "Нийлүүлэгчийн санал",
  "Батлагдсан санал",
  "Худалдан авалт",
  "Суурилуулалт",
  "Ашиглалтад оруулалт",
  "Бодит хяналтын өгөгдөл",
];

export function PlanView({ plan, calcVersion }: { plan: PrelimResult; calcVersion: string }) {
  const lim = L.mn.limitation as Record<string, string>;
  const miss = L.mn.missing as Record<string, string>;
  const why = L.mn.missingWhy as Record<string, string>;
  return (
    <div className="space-y-4">
      <Alert tone="warn" title="УРЬДЧИЛСАН ТООЦОО — ҮНИЙН САНАЛ БИШ">
        Энэ нь таны оруулсан мэдээлэлд суурилсан ойролцоо хүрээ. Инженерийн баталгаажуулалт, нийлүүлэгчийн үнийн санал, гэрээ биш.
      </Alert>

      {plan.state === "insufficient_data" ? (
        <Card>
          <CardTitle>Тооцоо хийхэд мэдээлэл хүрэлцэхгүй байна</CardTitle>
          <p className="text-sm">Системийн хүчин чадлын хүрээг тооцоолохын тулд <strong>сарын цахилгаан хэрэглээ (кВт·ц)</strong> шаардлагатай. Одоогоор тоо зохиож харуулахгүй.</p>
          <p className="mt-2 text-sm text-muted">Цахилгааны нэхэмжлэхээс сарын кВт·ц-ийг харж болно. Төслийн хуудаснаас нэхэмжлэхийн зургийг оруулах эсвэл манай багийн асуултад хариулна уу — тэгвэл бид тооцоог шинэчилнэ.</p>
        </Card>
      ) : (
        <Card>
          <CardTitle actions={<Badge tone="warn">Итгэлцэл: {mnLab("confidence", plan.confidence)}</Badge>}>Боломжит хувилбарууд</CardTitle>
          <p className="mb-3 text-sm text-muted">Жилийн хэрэглээ ≈ {fmtNumber(plan.annualKwh)} кВт·ц (таны сарын хэрэглээ × 12). Доорх хувилбарууд нь жишээ зорилтууд бөгөөд зөвлөмж биш.</p>
          <TableWrap caption="Урьдчилсан хувилбарууд">
            <thead><tr><Th>Зорилтот хангалт</Th><Th>Жилийн зорилт (кВт·ц)</Th><Th>Ойролцоо хүчин чадал (кВп)</Th><Th>Шаардагдах талбай (м²)</Th><Th>Талбайн шалгалт</Th></tr></thead>
            <tbody>
              {plan.options.map((o) => (
                <tr key={o.id}>
                  <Td>{Math.round(o.offsetTarget * 100)}%</Td>
                  <Td>{fmtNumber(o.annualTargetKwh)}</Td>
                  <Td>{o.pvKwpRange.low} – {o.pvKwpRange.high}</Td>
                  <Td>{o.areaNeededM2.low} – {o.areaNeededM2.high}</Td>
                  <Td>{mnLab("areaCheck", o.areaCheck)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="mt-4 text-sm"><strong>Батарей, нөөц цахилгаан:</strong> {mnLab("batteryNote", plan.batteryNote)}</p>
        </Card>
      )}

      {plan.missing.length > 0 && (
        <Card>
          <CardTitle>Тооцоог сайжруулах дутуу мэдээлэл</CardTitle>
          <ul className="space-y-2 text-sm">
            {plan.missing.map((m) => (
              <li key={m}><span className="font-medium">{miss[m] ?? m}</span><span className="block text-muted">{why[m] ?? ""}</span></li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>Хязгаарлалт</CardTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {plan.limitations.map((l) => <li key={l}>{lim[l] ?? l}</li>)}
        </ul>
        <p className="mt-3 text-sm text-muted">Дараагийн алхам: {plan.nextStep === "provide_consumption" ? "сарын хэрэглээний мэдээллээ өгөх." : "манай баг байршлын үзлэг, техникийн үнэлгээ хийж, нийлүүлэгчээс санал авна."}</p>
      </Card>

      <Card>
        <CardTitle>Тооцооны мөрдөх мэдээлэл</CardTitle>
        <p className="mb-2 text-xs text-muted">Тооцооны хувилбар: <code className="font-mono">{calcVersion}</code> · Ижил оролтоор ижил үр дүн гарна.</p>
        {plan.assumptions.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-navy-50 p-3 font-mono text-xs">
            {plan.assumptions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Төлөвүүд хоорондоо өөр</CardTitle>
        <ol className="space-y-1 text-sm">
          {STAGES.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <Badge tone={i === 0 ? "sun" : "neutral"}>{i === 0 ? "Одоо байгаа" : "Хараахан байхгүй"}</Badge>
              <span className={i === 0 ? "font-semibold" : "text-muted"}>{s}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
