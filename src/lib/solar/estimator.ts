import { calculatePrelim, CALC_VERSION, type PrelimInput, type PrelimResult } from "./prelim";

/**
 * Boundary for solar estimation services.
 *
 * Today the only estimator is the planning-range sizing in `prelim.ts`, which has NO validation evidence. A future
 * service (an in-house simulator, PVGIS / NASA POWER integration, a partner's API) plugs in by implementing
 * `Estimator` and declaring `validation`: where its yield figures were checked against measured data, by whom and when.
 *
 * `runEstimate` is the only call the application makes. It refuses to let an estimator WITHOUT validation evidence
 * return a generation, savings, payback, cost, tariff or battery-size figure, so an unvalidated model cannot put an
 * authoritative-looking number in front of a customer by accident. Evidence is a claim made by a person who can be held
 * to it; the guard does not (cannot) judge whether the evidence is good, only that none is missing.
 */

export interface ValidationEvidence {
  /** Where the validation is documented (report, ticket, URL). */
  reference: string;
  /** ISO date of the validation. */
  validatedOn: string;
  /** What was validated and against what (e.g. "measured output of 3 sites in Töv aimag, 2025-26"). */
  scope: string;
}

export interface Estimator<I, R extends { version: string }> {
  readonly id: string;
  readonly version: string;
  /** null = not validated. Quantitative yield/finance claims are then refused by `runEstimate`. */
  readonly validation: ValidationEvidence | null;
  estimate(input: I): R;
}

/** Substrings (case-insensitive) of result keys that make a claim only a validated model may make. */
export const VALIDATED_ONLY_KEY_PARTS = ["generation", "yieldkwh", "saving", "payback", "cost", "price", "tariff", "batterykwh", "batterysize", "irr", "roi"] as const;

function collectKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => collectKeys(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.push(k); collectKeys(x, out); }
  return out;
}

export class UnvalidatedClaimError extends Error {
  constructor(public readonly estimatorId: string, public readonly keys: string[]) {
    super(`Estimator "${estimatorId}" has no validation evidence but returned: ${keys.join(", ")}`);
    this.name = "UnvalidatedClaimError";
  }
}

export function runEstimate<I, R extends { version: string }>(estimator: Estimator<I, R>, input: I): R {
  const result = estimator.estimate(input);
  if (result.version !== estimator.version) throw new Error(`Estimator "${estimator.id}" returned version ${result.version}, expected ${estimator.version}`);
  if (!estimator.validation) {
    const offending = collectKeys(result).filter((k) => VALIDATED_ONLY_KEY_PARTS.some((p) => k.toLowerCase().includes(p)));
    if (offending.length) throw new UnvalidatedClaimError(estimator.id, [...new Set(offending)]);
  } else if (!estimator.validation.reference.trim() || Number.isNaN(Date.parse(estimator.validation.validatedOn)) || !estimator.validation.scope.trim()) {
    throw new Error(`Estimator "${estimator.id}" declares validation evidence without a reference, date and scope`);
  }
  return result;
}

/** The planning-range sizing used today. Not validated: see docs/SOLAR_MODEL.md. */
export const prelimEstimator: Estimator<PrelimInput, PrelimResult> = {
  id: "prelim-sizing",
  version: CALC_VERSION,
  validation: null,
  estimate: calculatePrelim,
};
