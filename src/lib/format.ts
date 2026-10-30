import { formatMoney, isCurrency, type Currency } from "@/lib/domain/money";

const TZ = "Asia/Ulaanbaatar";

/** 2026-10-27 (date part, Ulaanbaatar time). Accepts ISO timestamps or plain YYYY-MM-DD dates. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

/** 2026-10-27 13:31 (Ulaanbaatar time). */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16);
}

export function fmtNumber(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).replace(/,/g, " ");
}

/** Money from integer minor units with an explicit currency. Unknown amounts render as an em dash, never as 0. */
export function fmtMoney(minor: number | null | undefined, currency: string | null | undefined): string {
  if (minor == null || !currency || !isCurrency(currency)) return "—";
  return formatMoney(minor, currency as Currency);
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Safe same-site redirect target taken from a query string. */
export function safeNext(v: string | null | undefined): string | null {
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return null;
  return v;
}
