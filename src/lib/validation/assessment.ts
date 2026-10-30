import { z } from "zod";

import { optNum, optText, reqText } from "./common";

export const CUSTOMER_TYPES = ["household", "business"] as const;
export const HOUSEHOLD_PROPERTY_TYPES = ["ger", "detached_house", "rural_property", "apartment", "other"] as const;
export const BUSINESS_PROPERTY_TYPES = ["shop", "office", "workshop", "warehouse", "farm", "other"] as const;
export const OWNERSHIP = ["owner", "controls", "tenant", "other"] as const;
export const OBJECTIVES = ["reduce_costs", "independence", "backup", "remote_site", "continuity", "exploring"] as const;
export const TIMEFRAMES = ["asap", "1_3_months", "3_6_months", "6_12_months", "exploring"] as const;

export const accountSchema = z.object({
  fullName: reqText("Нэрээ оруулна уу", 120),
  phone: z
    .string({ error: "Утасны дугаараа оруулна уу" })
    .trim()
    .regex(/^[+]?[\d\s-]{7,20}$/, "Утасны дугаар буруу байна"),
  email: z.string({ error: "Имэйл оруулна уу" }).trim().toLowerCase().email("Имэйл хаяг буруу байна").max(200),
  password: z.string({ error: "Нууц үг оруулна уу" }).min(8, "Нууц үг дор хаяж 8 тэмдэгт байх ёстой").max(200),
});
export type AccountInput = z.infer<typeof accountSchema>;

export const assessmentShape = {
  customerType: z.enum(CUSTOMER_TYPES, { error: "Хэрэглэгчийн төрлөө сонгоно уу" }),

  // Site
  province: reqText("Аймаг/хотоо оруулна уу", 120),
  district: optText(120),
  city: optText(120),
  locationDescription: reqText("Байршлын тайлбар оруулна уу", 1000),
  propertyType: reqText("Байрны төрлөө сонгоно уу", 60),
  address: optText(500),
  latitude: optNum(-90, 90, "Өргөрөг -90..90 байх ёстой"),
  longitude: optNum(-180, 180, "Уртраг -180..180 байх ёстой"),
  ownership: z.enum(OWNERSHIP, { error: "Өмчлөл/эзэмшлийн төлөвөө сонгоно уу" }),
  installAreaNote: optText(1000),
  installAreaM2: optNum(1, 100000, "Талбай эерэг тоо байх ёстой"),
  shadingNotes: optText(1000),

  // Energy
  usageUnknown: z.boolean().default(false),
  monthlyKwh: optNum(0, 10_000_000, "кВт·ц буруу байна"),
  billAmount: optNum(0, 10_000_000_000, "Төлбөрийн дүн буруу байна"),
  billingPeriod: optText(100),
  utilityBillNote: optText(1000),
  majorLoads: optText(2000),
  operatingHours: optText(500),
  criticalLoads: optText(2000),
  backupNeeded: z.enum(["yes", "no", "unknown"], { error: "Нөөц цахилгааны хэрэгцээгээ сонгоно уу" }),
  existingEquipment: optText(2000),

  // Business-only
  businessName: optText(200),
  businessCategory: optText(200),
  businessOperatingHours: optText(500),
  businessUsagePattern: optText(2000),
  businessSeasonalPattern: optText(2000),
  businessCriticalEquipment: optText(2000),
  additionalSitesNote: optText(2000),

  // Objectives
  objectives: z.array(z.enum(OBJECTIVES)).min(1, "Дор хаяж нэг зорилт сонгоно уу"),
  budgetMin: optNum(0, 100_000_000_000, "Төсөв буруу байна"),
  budgetMax: optNum(0, 100_000_000_000, "Төсөв буруу байна"),
  timeframe: z.enum(TIMEFRAMES, { error: "Хугацаагаа сонгоно уу" }),

  consent: z.literal(true, { error: "Мэдээллээ боловсруулахыг зөвшөөрнө үү" }),
};

export type AssessmentFieldKey = keyof typeof assessmentShape;

/** Fields shown in each wizard step (step 0 = customer type, ... 4 = review/consent). */
export const STEP_FIELDS: readonly (readonly AssessmentFieldKey[])[] = [
  ["customerType"],
  ["province", "district", "city", "locationDescription", "propertyType", "address", "latitude", "longitude", "ownership", "installAreaNote", "installAreaM2", "shadingNotes"],
  [
    "usageUnknown", "monthlyKwh", "billAmount", "billingPeriod", "utilityBillNote", "majorLoads", "operatingHours", "criticalLoads",
    "backupNeeded", "existingEquipment", "businessName", "businessCategory", "businessOperatingHours", "businessUsagePattern",
    "businessSeasonalPattern", "businessCriticalEquipment", "additionalSitesNote",
  ],
  ["objectives", "budgetMin", "budgetMax", "timeframe"],
  ["consent"],
];

type CrossValues = Partial<z.output<z.ZodObject<typeof assessmentShape>>>;

/** Cross-field rules shared by the server schema and the step-by-step wizard validation. */
export function crossIssues(v: CrossValues): { path: AssessmentFieldKey; message: string }[] {
  const out: { path: AssessmentFieldKey; message: string }[] = [];
  const add = (path: AssessmentFieldKey, message: string) => out.push({ path, message });

  const allowed: readonly string[] = v.customerType === "household" ? HOUSEHOLD_PROPERTY_TYPES : BUSINESS_PROPERTY_TYPES;
  if (v.customerType && v.propertyType && !allowed.includes(v.propertyType)) add("propertyType", "Энэ төрлийн хэрэглэгчид тохирохгүй байрны төрөл байна");

  if (v.usageUnknown !== true && v.monthlyKwh === undefined && v.billAmount === undefined) {
    add("monthlyKwh", "Сарын хэрэглээ эсвэл төлбөрөө оруулна уу, эсвэл «Мэдэхгүй» гэж тэмдэглэнэ үү");
  }
  if (v.billAmount !== undefined && !v.billingPeriod) add("billingPeriod", "Төлбөрийн хугацааг (жишээ: 2026 оны 9-р сар) оруулна уу");
  if ((v.latitude === undefined) !== (v.longitude === undefined)) add("latitude", "Өргөрөг, уртрагийг хоёуланг нь оруулна уу эсвэл хоёуланг нь хоосон үлдээнэ үү");
  if (v.budgetMin !== undefined && v.budgetMax !== undefined && v.budgetMax < v.budgetMin) {
    add("budgetMax", "Дээд төсөв нь доод төсвөөс бага байж болохгүй");
  }
  if (v.customerType === "business") {
    if (!v.businessName) add("businessName", "Байгууллагын нэрийг оруулна уу");
    if (!v.businessCategory) add("businessCategory", "Үйл ажиллагааны төрлийг оруулна уу");
    if (!v.businessOperatingHours) add("businessOperatingHours", "Ажиллах цагийг оруулна уу");
    if (!v.businessUsagePattern) add("businessUsagePattern", "Өдрийн хэрэглээний хэв маягийг тайлбарлана уу");
  }
  return out;
}

export const assessmentSchema = z.object(assessmentShape).superRefine((v, ctx) => {
  for (const i of crossIssues(v)) ctx.addIssue({ code: "custom", path: [i.path], message: i.message });
});

export type AssessmentInput = z.output<typeof assessmentSchema>;

export function flattenIssues(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Data the customer did not supply, in English keys (UI maps them to Mongolian explanations). */
export function missingFromAssessment(v: AssessmentInput): string[] {
  const m: string[] = [];
  if (v.monthlyKwh === undefined) m.push("monthly_kwh");
  if (v.billAmount === undefined) m.push("bill_amount");
  if (v.latitude === undefined) m.push("coordinates");
  if (!v.shadingNotes) m.push("shading");
  if (v.installAreaM2 === undefined) m.push("install_area");
  if (!v.majorLoads) m.push("major_loads");
  if (v.backupNeeded !== "no" && !v.criticalLoads) m.push("critical_loads");
  return m;
}

/**
 * Validates only the fields of one wizard step, using the same field rules and cross-field rules as the server.
 * Each field is parsed on its own so a problem in a later step never hides or triggers errors in this one.
 */
export function validateStep(step: number, raw: Record<string, unknown>): Record<string, string> {
  const keys = STEP_FIELDS[step] ?? [];
  const errors: Record<string, string> = {};
  const parsed: Record<string, unknown> = {};
  for (const key of Object.keys(assessmentShape) as AssessmentFieldKey[]) {
    const res = assessmentShape[key].safeParse(raw[key]);
    if (res.success) parsed[key] = res.data;
    else if (keys.includes(key)) errors[key] = res.error.issues[0]?.message ?? "Буруу утга";
  }
  for (const issue of crossIssues(parsed as CrossValues)) {
    if (keys.includes(issue.path) && !(issue.path in errors)) errors[issue.path] = issue.message;
  }
  return errors;
}
