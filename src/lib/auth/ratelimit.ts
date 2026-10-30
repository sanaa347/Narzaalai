/** Minimal in-memory login throttle (per process). Good enough for the MVP; use a shared store when scaling out. */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 8;
const failures = new Map<string, number[]>();

const recent = (key: string, now: number): number[] => {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, list);
  return list;
};

export function loginBlocked(key: string, now = Date.now()): boolean {
  return recent(key.toLowerCase(), now).length >= MAX_FAILURES;
}
export function recordLoginFailure(key: string, now = Date.now()): void {
  recent(key.toLowerCase(), now).push(now);
}
export function clearLoginFailures(key: string): void {
  failures.delete(key.toLowerCase());
}

const buckets = new Map<string, number[]>();

/**
 * Generic sliding-window counter. Records one hit and returns true when `max` hits within `windowMs` were already used
 * (the new hit is not counted in that case). In-memory and per process: replace with a shared store before scaling out.
 */
export function hitLimit(bucket: string, key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const k = `${bucket}:${key.toLowerCase()}`;
  const list = (buckets.get(k) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    buckets.set(k, list);
    return true;
  }
  list.push(now);
  buckets.set(k, list);
  return false;
}
