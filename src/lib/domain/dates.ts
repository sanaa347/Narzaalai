/**
 * Business calendar. Narzaalai operates in Ulaanbaatar (UTC+8, no daylight saving), so "today" and "valid until" are
 * calendar days THERE. Comparing against the UTC date is wrong for 8 hours every day: a quotation valid until 28 Oct would
 * still look current until 08:00 on 29 Oct. All "is this date past?" decisions go through this module.
 *
 * Dates are stored as plain `YYYY-MM-DD` strings (a calendar day, not an instant).
 */
export const BUSINESS_TIME_ZONE = "Asia/Ulaanbaatar";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** The Ulaanbaatar calendar day (YYYY-MM-DD) of an instant. */
export function localDate(at: Date = new Date()): string {
  return dayFormat.format(at);
}

/** Calendar day `days` days after the given instant's Ulaanbaatar day. */
export function localDatePlusDays(days: number, at: Date = new Date()): string {
  const [y, m, d] = localDate(at).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function offsetMs(at: Date): number {
  const p = Object.fromEntries(partsFormat.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant at which the given Ulaanbaatar calendar day starts (00:00:00.000 local). */
export function startOfLocalDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  return new Date(endOfLocalDay(prev).getTime() + 1);
}

/** The instant at which the given Ulaanbaatar calendar day ends (23:59:59.999 local). */
export function endOfLocalDay(day: string): Date {
  const guess = new Date(`${day}T23:59:59.999Z`);
  return new Date(guess.getTime() - offsetMs(guess));
}
