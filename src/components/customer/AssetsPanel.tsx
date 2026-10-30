import { Alert, Badge, Card, CardTitle, DefList } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/format";
import { mnLab } from "@/i18n";
import type { AssetRow, WarrantyRow } from "@/lib/db/types";

export function AssetsPanel({ assets }: { assets: (AssetRow & { warranties: WarrantyRow[] })[] }) {
  return (
    <Card aria-labelledby="assets-h">
      <CardTitle id="assets-h">Суурилуулсан тоног төхөөрөмж ба баталгаа</CardTitle>
      {assets.length === 0 ? (
        <p className="text-sm text-muted">Суурилуулалт дууссаны дараа энд харагдана.</p>
      ) : (
        <div className="space-y-4">
          {assets.map((a) => (
            <div key={a.id} className="rounded-lg border border-navy-100 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-navy-900">{mnLab("productCategory", a.category)}: {a.manufacturer} {a.model}</h3>
                <Badge tone={a.commissioning_state === "commissioned" ? "success" : a.commissioning_state === "failed" ? "danger" : "warn"}>{mnLab("commissioning", a.commissioning_state)}</Badge>
              </div>
              <DefList items={[
                { label: "Серийн дугаар", value: a.serial_number ?? "Бүртгээгүй" },
                { label: "Суурилуулсан огноо", value: fmtDate(a.installation_date) },
                { label: "Тэмдэглэл", value: a.notes },
              ]} />
              <div className="mt-3 border-t border-navy-100 pt-2 text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Баталгаа</p>
                {a.warranties.length === 0 ? <p className="text-muted">Баталгааны бүртгэл оруулаагүй.</p> : a.warranties.map((w) => (
                  <div key={w.id} className="mb-2">
                    <p className="font-medium">{w.provider} <Badge tone={w.verification_state === "evidence_recorded" ? "success" : "warn"}>{mnLab("warrantyVerification", w.verification_state)}</Badge></p>
                    <p className="text-muted">{w.start_date || w.end_date ? `${fmtDate(w.start_date)} – ${fmtDate(w.end_date)}` : "Хугацаа бүртгээгүй"}</p>
                    {w.terms && <p className="whitespace-pre-line text-muted">{w.terms}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Alert tone="info" className="mt-4" title="Бодит хяналт">Системийн бодит цагийн хяналтын мэдээлэл одоогоор холбогдоогүй (мэдээлэл холбоогүй). Ямар ч хяналтын график, тоо харуулахгүй.</Alert>
    </Card>
  );
}
