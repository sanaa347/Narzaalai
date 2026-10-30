/**
 * Money handling. All amounts are integers in minor units; never floats.
 * MNT is treated as a 0-decimal currency in practice (documented deviation from ISO 4217's exponent of 2).
 */
export const CURRENCIES = ["MNT", "USD", "CNY", "EUR", "KRW"] as const;
export type Currency = (typeof CURRENCIES)[number];

const EXPONENT: Record<Currency, number> = { MNT: 0, USD: 2, CNY: 2, EUR: 2, KRW: 0 };

export function isCurrency(v: string): v is Currency {
  return (CURRENCIES as readonly string[]).includes(v);
}

export function exponentOf(currency: Currency): number {
  return EXPONENT[currency];
}

/** Parses a user-entered decimal string ("1 250 000", "1,250.50") into minor units. Returns null when invalid. */
export function parseMoney(input: string, currency: Currency): number | null {
  const cleaned = input.trim().replace(/[\s_']/g, "").replace(/,/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const exp = EXPONENT[currency];
  if (frac.length > exp && /[1-9]/.test(frac.slice(exp))) return null; // would lose precision
  const fracPadded = (frac + "0".repeat(exp)).slice(0, exp);
  const minor = Number(whole + fracPadded);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function formatMoney(minor: number, currency: Currency, locale = "mn-MN"): string {
  const exp = EXPONENT[currency];
  const major = minor / 10 ** exp;
  const num = new Intl.NumberFormat(locale, { minimumFractionDigits: exp, maximumFractionDigits: exp }).format(major);
  return `${num} ${currency}`;
}

export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error("Money values must be integer minor units");
    total += v;
  }
  if (!Number.isSafeInteger(total)) throw new Error("Money total overflow");
  return total;
}
