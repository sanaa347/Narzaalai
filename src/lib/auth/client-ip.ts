/**
 * Client address used ONLY as a rate-limit key.
 *
 * `X-Forwarded-For` is a list: every proxy appends the address it received the request from, but the entries to the
 * LEFT can be written by the client. Only the entry added by the proxy we operate is trustworthy, so we count from the
 * right: with TRUSTED_PROXY_HOPS=1 (default; one reverse proxy / platform edge in front of the app) the last entry is
 * used. With 0 the header is ignored (app exposed directly: there is no trustworthy address, so everyone shares the
 * "unknown" bucket and the per-e-mail limit remains the effective control). Anything that is not an IP literal is
 * rejected so a client cannot create unbounded distinct keys.
 */
const IP_LITERAL = /^[0-9a-fA-F:.]{2,45}$/;

export function trustedProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS;
  if (raw === undefined || raw.trim() === "") return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 1;
}

export function clientIp(headers: { get(name: string): string | null }, hops: number = trustedProxyHops()): string {
  if (hops <= 0) return "unknown";
  const parts = (headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const entry = parts[parts.length - hops];
  return entry && IP_LITERAL.test(entry) ? entry : "unknown";
}
