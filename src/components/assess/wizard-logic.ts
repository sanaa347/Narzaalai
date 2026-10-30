import {
  BUSINESS_PROPERTY_TYPES, HOUSEHOLD_PROPERTY_TYPES, OBJECTIVES, STEP_FIELDS, accountSchema, validateStep,
} from "@/lib/validation/assessment";
import { L } from "@/i18n";

/** Pure wizard logic (no React) so it can be unit-tested. Values are strings, except booleans and the objectives array. */
export type Values = Record<string, unknown>;

export const DRAFT_KEY = "narzaalai.assessment.draft.v1";
export const STEP_COUNT = 5;
export const STEP_TITLES = ["Төрөл", "Байршил", "Хэрэглээ", "Зорилго", "Хянах"] as const;

export const CONTACT_KEYS = ["fullName", "phone", "email"] as const;

export function initialValues(type?: string | null): Values {
  return {
    customerType: type === "household" || type === "business" ? type : "",
    usageUnknown: false, backupNeeded: "", objectives: [], consent: false,
  };
}

export const str = (v: unknown): string => (typeof v === "string" ? v : "");
const empty = (v: unknown): boolean => str(v).trim() === "";

export function propertyOptions(type: unknown): { value: string; label: string }[] {
  const list: readonly string[] = type === "business" ? BUSINESS_PROPERTY_TYPES : type === "household" ? HOUSEHOLD_PROPERTY_TYPES : [];
  return list.map((value) => ({ value, label: L.mn.propertyType[value as keyof typeof L.mn.propertyType] ?? value }));
}

/** Items from L.mn.missing that the customer has not provided yet (they would improve the estimate). */
export function missingHints(v: Values): { key: keyof typeof L.mn.missing; label: string; why: string }[] {
  const keys: (keyof typeof L.mn.missing)[] = [];
  if (empty(v.monthlyKwh)) keys.push("monthly_kwh");
  if (empty(v.billAmount)) keys.push("bill_amount");
  if (empty(v.latitude) || empty(v.longitude)) keys.push("coordinates");
  if (empty(v.shadingNotes)) keys.push("shading");
  if (empty(v.installAreaM2)) keys.push("install_area");
  if (empty(v.majorLoads)) keys.push("major_loads");
  if (v.backupNeeded !== "no" && empty(v.criticalLoads)) keys.push("critical_loads");
  return keys.map((key) => ({ key, label: L.mn.missing[key], why: L.mn.missingWhy[key] }));
}

/** Payload for the server action: trimmed strings, real booleans/arrays, no contact or password fields. */
export function toPayload(v: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    if ((CONTACT_KEYS as readonly string[]).includes(k) || k === "password") continue;
    out[k] = typeof val === "string" ? val.trim() : val;
  }
  out.usageUnknown = v.usageUnknown === true;
  out.consent = v.consent === true;
  out.objectives = Array.isArray(v.objectives) ? v.objectives.filter((o) => (OBJECTIVES as readonly string[]).includes(String(o))) : [];
  return out;
}

export function toAccount(v: Values, password: string) {
  return { fullName: str(v.fullName).trim(), phone: str(v.phone).trim(), email: str(v.email).trim(), password };
}

/** Contact fields (step 1) and password (step 4) are validated with the same schema the server uses. */
export function validateAccountStep(step: number, v: Values, password: string, signedIn: boolean): Record<string, string> {
  if (signedIn) return {};
  const errors: Record<string, string> = {};
  const keys = step === 1 ? CONTACT_KEYS : step === 4 ? (["password"] as const) : [];
  for (const k of keys) {
    const raw = k === "password" ? password : v[k];
    const r = accountSchema.shape[k].safeParse(raw);
    if (!r.success) errors[k] = r.error.issues[0]?.message ?? "Буруу утга";
  }
  return errors;
}

export function validateWizardStep(step: number, v: Values, password: string, signedIn: boolean): Record<string, string> {
  return { ...validateStep(step, toPayload(v)), ...validateAccountStep(step, v, password, signedIn) };
}

export function stepOfField(key: string): number {
  if ((CONTACT_KEYS as readonly string[]).includes(key)) return 1;
  if (key === "password") return 4;
  const i = STEP_FIELDS.findIndex((fields) => (fields as readonly string[]).includes(key));
  return i === -1 ? 4 : i;
}

/** Maps server field errors to the earliest step that contains an erroring field. */
export function splitServerErrors(fieldErrors: Record<string, string> | undefined): { step: number; errors: Record<string, string> } {
  const errors = fieldErrors ?? {};
  const keys = Object.keys(errors);
  if (keys.length === 0) return { step: 4, errors };
  return { step: Math.min(...keys.map(stepOfField)), errors };
}

/** Review screen data, grouped by the step that owns each section. */
export function summarize(v: Values, signedIn: boolean): { title: string; step: number; items: { label: string; value: string }[] }[] {
  const type = str(v.customerType);
  const pick = (map: Record<string, string>, k: unknown) => map[str(k)] ?? str(k);
  const row = (label: string, value: string) => ({ label, value: value.trim() === "" ? "—" : value });
  const t = L.mn;
  const site = [
    ...(signedIn ? [] : [row("Нэр", str(v.fullName)), row("Утас", str(v.phone)), row("Имэйл", str(v.email))]),
    row("Аймаг / хот", str(v.province)), row("Сум / дүүрэг", str(v.district)), row("Хот / суурин", str(v.city)),
    row("Байршлын тайлбар", str(v.locationDescription)), row("Байрны төрөл", pick(t.propertyType, v.propertyType)),
    row("Хаяг", str(v.address)),
    row("Координат", empty(v.latitude) ? "" : `${str(v.latitude)}, ${str(v.longitude)}`),
    row("Өмчлөл", pick(t.ownership, v.ownership)), row("Талбай (м²)", str(v.installAreaM2)),
    row("Талбайн тайлбар", str(v.installAreaNote)), row("Сүүдэр, саад", str(v.shadingNotes)),
  ];
  const energy = [
    row("Сарын хэрэглээ (кВт·ц)", v.usageUnknown === true && empty(v.monthlyKwh) ? "Мэдэхгүй" : str(v.monthlyKwh)),
    row("Төлбөрийн дүн (₮)", str(v.billAmount)), row("Төлбөрийн хугацаа", str(v.billingPeriod)),
    row("Үндсэн ачаалал", str(v.majorLoads)), row("Ажиллах цаг", str(v.operatingHours)),
    row("Тасалдуулж болохгүй ачаалал", str(v.criticalLoads)), row("Нөөц цахилгаан", pick(t.backup, v.backupNeeded)),
    row("Одоо байгаа тоног төхөөрөмж", str(v.existingEquipment)),
    ...(type === "business"
      ? [
          row("Байгууллагын нэр", str(v.businessName)), row("Үйл ажиллагааны төрөл", str(v.businessCategory)),
          row("Ажиллах цаг (бизнес)", str(v.businessOperatingHours)), row("Өдрийн хэрэглээний хэв маяг", str(v.businessUsagePattern)),
          row("Улирлын хэлбэлзэл", str(v.businessSeasonalPattern)), row("Чухал тоног төхөөрөмж", str(v.businessCriticalEquipment)),
          row("Бусад байршил", str(v.additionalSitesNote)),
        ]
      : []),
  ];
  const objectives = (Array.isArray(v.objectives) ? v.objectives : []).map((o) => pick(t.objective, o)).join("; ");
  return [
    { title: "Хэрэглэгчийн төрөл", step: 0, items: [row("Төрөл", pick(t.customerType, v.customerType))] },
    { title: "Байршил, байр", step: 1, items: site },
    { title: "Эрчим хүчний хэрэглээ", step: 2, items: energy },
    {
      title: "Зорилго, төсөв", step: 3,
      items: [row("Зорилго", objectives), row("Төсөв (доод, ₮)", str(v.budgetMin)), row("Төсөв (дээд, ₮)", str(v.budgetMax)), row("Хугацаа", pick(t.timeframe, v.timeframe))],
    },
  ];
}
