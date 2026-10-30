import { describe, expect, it } from "vitest";
import { clientIp, trustedProxyHops } from "@/lib/auth/client-ip";

const h = (v: string | null) => ({ get: (n: string) => (n.toLowerCase() === "x-forwarded-for" ? v : null) });

describe("clientIp (rate-limit key)", () => {
  it("uses the entry appended by our own proxy, not what the client wrote on the left", () => {
    expect(clientIp(h("6.6.6.6, 203.0.113.9"), 1)).toBe("203.0.113.9");
    expect(clientIp(h("6.6.6.6, 7.7.7.7, 203.0.113.9"), 1)).toBe("203.0.113.9");
  });
  it("a spoofed header cannot choose a fresh bucket for every request", () => {
    const keys = new Set(["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((spoof) => clientIp(h(`${spoof}, 203.0.113.9`), 1)));
    expect(keys.size).toBe(1);
  });
  it("supports two proxies in front", () => {
    expect(clientIp(h("6.6.6.6, 203.0.113.9, 10.0.0.2"), 2)).toBe("203.0.113.9");
  });
  it("ignores the header when no proxy is trusted, and when the header is missing, short or malformed", () => {
    expect(clientIp(h("203.0.113.9"), 0)).toBe("unknown");
    expect(clientIp(h(null), 1)).toBe("unknown");
    expect(clientIp(h("203.0.113.9"), 2)).toBe("unknown");
    expect(clientIp(h("<script>, not-an-ip"), 1)).toBe("unknown");
    expect(clientIp(h("1.1.1.1, " + "9".repeat(60)), 1)).toBe("unknown");
  });
  it("accepts IPv6", () => {
    expect(clientIp(h("2001:db8::1"), 1)).toBe("2001:db8::1");
  });
  it("TRUSTED_PROXY_HOPS defaults to 1 and rejects nonsense", () => {
    expect(trustedProxyHops({} as NodeJS.ProcessEnv)).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "0" } as unknown as NodeJS.ProcessEnv)).toBe(0);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "2" } as unknown as NodeJS.ProcessEnv)).toBe(2);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "-3" } as unknown as NodeJS.ProcessEnv)).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "abc" } as unknown as NodeJS.ProcessEnv)).toBe(1);
  });
});
