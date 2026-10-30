import { Card, CardTitle, DefList, Badge } from "@/components/ui/primitives";
import { fmtMoney, fmtNumber, parseJson } from "@/lib/format";
import { mnLab } from "@/i18n";
import { L } from "@/i18n";
import type { AssessmentRow, EnergyProfileRow, SiteRow } from "@/lib/db/types";

const UNKNOWN = <span className="text-muted">Мэдэгдэхгүй</span>;

export function SiteEnergySummary({ site, energy, assessment }: { site: SiteRow; energy: EnergyProfileRow; assessment: AssessmentRow }) {
  const objectives = parseJson<string[]>(energy.objectives, []);
  const missing = parseJson<string[]>(assessment.missing_data, []);
  const business = energy.business_name !== null || energy.business_category !== null;
  const budget =
    energy.budget_min_minor != null || energy.budget_max_minor != null
      ? `${energy.budget_min_minor != null ? fmtMoney(energy.budget_min_minor, energy.budget_currency) : "—"} – ${energy.budget_max_minor != null ? fmtMoney(energy.budget_max_minor, energy.budget_currency) : "—"}`
      : null;
  return (
    <>
      <Card aria-labelledby="site-h">
        <CardTitle id="site-h">Байршил ба байр</CardTitle>
        <DefList
          items={[
            { label: "Аймаг / хот", value: site.province },
            { label: "Дүүрэг / сум", value: site.district ?? site.city },
            { label: "Байршлын тайлбар", value: site.location_description },
            { label: "Байрны төрөл", value: mnLab("propertyType", site.property_type) },
            { label: "Өмчлөл", value: mnLab("ownership", site.ownership) },
            { label: "Хаяг", value: site.address },
            { label: "Координат", value: site.latitude != null && site.longitude != null ? `${site.latitude}, ${site.longitude}` : UNKNOWN },
            { label: "Суурилуулах талбай", value: site.install_area_m2 != null ? `${fmtNumber(site.install_area_m2, 1)} м²` : (site.install_area_note ?? UNKNOWN) },
            { label: "Сүүдэр, саад тотгор", value: site.shading_notes ?? UNKNOWN },
          ]}
        />
      </Card>
      <Card aria-labelledby="energy-h">
        <CardTitle id="energy-h">Таны оруулсан эрчим хүчний мэдээлэл</CardTitle>
        <DefList
          items={[
            { label: "Сарын хэрэглээ", value: energy.monthly_kwh != null ? `${fmtNumber(energy.monthly_kwh, 1)} кВт·ц` : UNKNOWN },
            { label: "Төлбөрийн дүн", value: energy.bill_amount_minor != null ? `${fmtMoney(energy.bill_amount_minor, energy.bill_currency)} (${energy.billing_period ?? "хугацаа заагаагүй"})` : UNKNOWN },
            { label: "Үндсэн ачаалал", value: energy.major_loads ?? UNKNOWN },
            { label: "Ажиллах цаг", value: energy.operating_hours ?? UNKNOWN },
            { label: "Тасалдуулж болохгүй ачаалал", value: energy.critical_loads ?? UNKNOWN },
            { label: "Нөөц цахилгаан", value: mnLab("backup", energy.backup_needed) },
            { label: "Одоо байгаа тоног төхөөрөмж", value: energy.existing_equipment ?? UNKNOWN },
            { label: "Зорилго", value: objectives.length ? objectives.map((o) => mnLab("objective", o)).join("; ") : UNKNOWN },
            { label: "Төсөв", value: budget ?? UNKNOWN },
            { label: "Хугацаа", value: mnLab("timeframe", energy.timeframe) },
            ...(business
              ? [
                  { label: "Байгууллага", value: energy.business_name },
                  { label: "Үйл ажиллагааны төрөл", value: energy.business_category },
                  { label: "Ажиллах цаг (бизнес)", value: energy.business_operating_hours },
                  { label: "Өдрийн хэрэглээний хэв маяг", value: energy.business_usage_pattern },
                  { label: "Улирлын хэв маяг", value: energy.business_seasonal_pattern },
                  { label: "Чухал тоног төхөөрөмж", value: energy.business_critical_equipment },
                  { label: "Нэмэлт байршил", value: energy.additional_sites_note },
                ]
              : []),
          ]}
          cols={2}
        />
      </Card>
      {missing.length > 0 && (
        <Card aria-labelledby="miss-h">
          <CardTitle id="miss-h" actions={<Badge tone="warn">{missing.length} дутуу</Badge>}>Тооцоог сайжруулах мэдээлэл</CardTitle>
          <p className="mb-3 text-sm text-muted">Дараах мэдээлэл дутуу байна. Манай баг асууж магадгүй; та баримт оруулах эсвэл холбогдож болно.</p>
          <ul className="space-y-2 text-sm">
            {missing.map((m) => (
              <li key={m}>
                <span className="font-medium text-navy-900">{L.mn.missing[m as keyof typeof L.mn.missing] ?? m}</span>
                <span className="block text-muted">{L.mn.missingWhy[m as keyof typeof L.mn.missingWhy] ?? ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
