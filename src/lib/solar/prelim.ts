/**
 * Preliminary sizing service. NOT an engineering-validated yield model.
 *
 * What it does: converts a customer-stated monthly consumption (kWh) into an indicative PV *capacity range* (kWp)
 * for a few offset targets, using planning-level specific-yield assumptions that are exposed in the output.
 *
 * What it deliberately does NOT do: produce a single generation figure, estimate costs, savings or payback
 * (no verified tariff or pricing inputs exist), or size a battery (needs critical-load power and autonomy hours).
 * Every result carries its inputs, assumptions, limitations and calculation version so it is reproducible.
 *
 * Replace `SPECIFIC_YIELD_KWH_PER_KWP_YEAR` with a verified irradiance model (e.g. PVGIS / NASA POWER or an
 * in-house simulator with validation evidence) before using results for quotations.
 */
export const CALC_VERSION = "prelim-sizing-0.1.0";

export const SPECIFIC_YIELD_KWH_PER_KWP_YEAR = { low: 1100, high: 1500 } as const;
export const MODULE_AREA_M2_PER_KWP = { low: 5.5, high: 7 } as const;
export const OFFSET_TARGETS = [0.5, 0.8] as const;

export interface PrelimInput {
  monthlyKwh: number | null; // customer-provided consumption in kWh per month; null when unknown
  backupNeeded: "yes" | "no" | "unknown";
  installAreaM2: number | null;
  hasCoordinates: boolean;
  hasShadingInfo: boolean;
  hasCriticalLoads: boolean;
}

export interface PrelimOption {
  id: string;
  offsetTarget: number; // fraction of annual consumption targeted, 0..1
  annualTargetKwh: number;
  pvKwpRange: { low: number; high: number };
  areaNeededM2: { low: number; high: number };
  areaCheck: "fits" | "may_not_fit" | "unknown";
}

export interface PrelimResult {
  version: string;
  state: "insufficient_data" | "preliminary";
  confidence: "insufficient" | "low" | "moderate";
  verification: "awaiting_verification";
  label: "PRELIMINARY — NOT A QUOTATION";
  input: PrelimInput;
  annualKwh: number | null;
  options: PrelimOption[];
  batteryNote: "not_needed_stated" | "needs_critical_load_data" | "undetermined";
  assumptions: string[];
  limitations: string[];
  missing: string[];
  nextStep: "provide_consumption" | "technical_assessment";
}

const round = (n: number, d = 1): number => Math.round(n * 10 ** d) / 10 ** d;

export function missingInputs(input: PrelimInput): string[] {
  const missing: string[] = [];
  if (input.monthlyKwh == null) missing.push("monthly_kwh");
  if (!input.hasCoordinates) missing.push("coordinates");
  if (!input.hasShadingInfo) missing.push("shading");
  if (input.installAreaM2 == null) missing.push("install_area");
  if (input.backupNeeded !== "no" && !input.hasCriticalLoads) missing.push("critical_loads");
  return missing;
}

export function calculatePrelim(input: PrelimInput): PrelimResult {
  const missing = missingInputs(input);
  const common = {
    version: CALC_VERSION,
    verification: "awaiting_verification" as const,
    label: "PRELIMINARY — NOT A QUOTATION" as const,
    input,
    missing,
    limitations: [
      "no_verified_irradiance_model",
      "no_cost_or_savings_estimate",
      "seasonality_not_modelled",
      "site_survey_required",
    ],
  };

  if (input.monthlyKwh == null) {
    return {
      ...common,
      state: "insufficient_data",
      confidence: "insufficient",
      annualKwh: null,
      options: [],
      batteryNote: input.backupNeeded === "no" ? "not_needed_stated" : "undetermined",
      assumptions: [],
      nextStep: "provide_consumption",
    };
  }

  const annualKwh = input.monthlyKwh * 12;
  const options: PrelimOption[] = OFFSET_TARGETS.map((offset) => {
    const target = annualKwh * offset;
    const low = target / SPECIFIC_YIELD_KWH_PER_KWP_YEAR.high;
    const high = target / SPECIFIC_YIELD_KWH_PER_KWP_YEAR.low;
    const areaNeeded = {
      low: round(low * MODULE_AREA_M2_PER_KWP.low),
      high: round(high * MODULE_AREA_M2_PER_KWP.high),
    };
    let areaCheck: PrelimOption["areaCheck"] = "unknown";
    if (input.installAreaM2 != null) areaCheck = areaNeeded.high <= input.installAreaM2 ? "fits" : "may_not_fit";
    return {
      id: `offset-${Math.round(offset * 100)}`,
      offsetTarget: offset,
      annualTargetKwh: round(target, 0),
      pvKwpRange: { low: round(low), high: round(high) },
      areaNeededM2: areaNeeded,
      areaCheck,
    };
  });

  const strong = !missing.includes("coordinates") && !missing.includes("shading") && !missing.includes("install_area");

  return {
    ...common,
    state: "preliminary",
    confidence: strong ? "moderate" : "low",
    annualKwh: round(annualKwh, 0),
    options,
    batteryNote: input.backupNeeded === "no" ? "not_needed_stated" : input.hasCriticalLoads ? "needs_critical_load_data" : "undetermined",
    assumptions: [
      `annual_consumption = monthly_kwh × 12 (seasonal variation unknown)`,
      `specific_yield_planning_range = ${SPECIFIC_YIELD_KWH_PER_KWP_YEAR.low}–${SPECIFIC_YIELD_KWH_PER_KWP_YEAR.high} kWh/kWp/year (planning assumption, not site-validated)`,
      `module_area = ${MODULE_AREA_M2_PER_KWP.low}–${MODULE_AREA_M2_PER_KWP.high} m²/kWp (typical crystalline modules, fixed mounting)`,
      `offset_targets = ${OFFSET_TARGETS.map((o) => `${o * 100}%`).join(", ")} of annual consumption (illustrative design targets, not recommendations)`,
    ],
    nextStep: "technical_assessment",
  };
}
