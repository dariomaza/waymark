import { describe, expect, it } from "vitest";

import {
  CLOUDFLARE_CLIENT_IP_HEADER,
  LOOPBACK_PROXIES,
  UNKNOWN_CLIENT_IP,
  resolveClientIp,
} from "./client-ip.js";

/**
 * Waymark is reached through a Cloudflare Tunnel, so `cloudflared` is always
 * the socket peer and the real caller only exists in `CF-Connecting-IP`.
 * Getting this wrong does not degrade the rate limiter, it disables it: every
 * request in the world would share one bucket.
 */
describe("resolveClientIp", () => {
  const throughTheTunnel = { trustedProxies: LOOPBACK_PROXIES };

  it("reads the caller from CF-Connecting-IP when the tunnel is the peer", () => {
    const ip = resolveClientIp(
      {
        headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "203.0.113.7" },
        remoteAddress: "127.0.0.1",
      },
      throughTheTunnel,
    );

    expect(ip).toBe("203.0.113.7");
  });

  it("does not collapse two different callers into the tunnel's own address", () => {
    const first = resolveClientIp(
      {
        headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "203.0.113.7" },
        remoteAddress: "127.0.0.1",
      },
      throughTheTunnel,
    );
    const second = resolveClientIp(
      {
        headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "198.51.100.4" },
        remoteAddress: "127.0.0.1",
      },
      throughTheTunnel,
    );

    expect(first).not.toBe(second);
  });

  it("accepts an IPv6 caller", () => {
    const ip = resolveClientIp(
      {
        headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "2001:db8::1" },
        remoteAddress: "::1",
      },
      throughTheTunnel,
    );

    expect(ip).toBe("2001:db8::1");
  });

  describe("spoofing", () => {
    it("ignores the header when the peer is not a trusted proxy", () => {
      const ip = resolveClientIp(
        {
          headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "203.0.113.7" },
          remoteAddress: "198.51.100.66",
        },
        throughTheTunnel,
      );

      expect(ip).toBe("198.51.100.66");
    });

    it("ignores a header that is not a single well formed IP address", () => {
      for (const forged of ["not-an-ip", "203.0.113.7, 10.0.0.1", "", "   "]) {
        const ip = resolveClientIp(
          {
            headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: forged },
            remoteAddress: "127.0.0.1",
          },
          throughTheTunnel,
        );

        expect(ip).toBe("127.0.0.1");
      }
    });

    it("ignores the header when it arrives more than once", () => {
      // Two headers mean somebody upstream added one of them. Cloudflare sends
      // exactly one, so the ambiguous case is never the honest case.
      const ip = resolveClientIp(
        {
          headers: {
            [CLOUDFLARE_CLIENT_IP_HEADER]: ["203.0.113.7", "10.0.0.1"],
          },
          remoteAddress: "127.0.0.1",
        },
        throughTheTunnel,
      );

      expect(ip).toBe("127.0.0.1");
    });
  });

  describe("fallbacks", () => {
    it("falls back to the socket address when the header is absent", () => {
      const ip = resolveClientIp(
        { headers: {}, remoteAddress: "127.0.0.1" },
        throughTheTunnel,
      );

      expect(ip).toBe("127.0.0.1");
    });

    it("buckets a request with no socket address at all under one key", () => {
      const ip = resolveClientIp(
        { headers: {}, remoteAddress: undefined },
        throughTheTunnel,
      );

      // Never a fresh key per request: that would hand an attacker an
      // unlimited supply of empty rate limit buckets.
      expect(ip).toBe(UNKNOWN_CLIENT_IP);
    });

    it("unwraps an IPv4 address that arrived over a dual stack socket", () => {
      const ip = resolveClientIp(
        { headers: {}, remoteAddress: "::ffff:198.51.100.4" },
        { trustedProxies: new Set<string>() },
      );

      expect(ip).toBe("198.51.100.4");
    });

    it("treats a dual stack loopback peer as the loopback proxy it is", () => {
      const ip = resolveClientIp(
        {
          headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "203.0.113.7" },
          remoteAddress: "::ffff:127.0.0.1",
        },
        throughTheTunnel,
      );

      expect(ip).toBe("203.0.113.7");
    });
  });

  describe("trusted proxy configuration", () => {
    it("trusts loopback out of the box, because cloudflared runs beside the API", () => {
      expect([...LOOPBACK_PROXIES].sort()).toEqual(["127.0.0.1", "::1"]);
    });

    it("can trust a proxy on a container network instead", () => {
      const ip = resolveClientIp(
        {
          headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "203.0.113.7" },
          remoteAddress: "172.18.0.2",
        },
        { trustedProxies: new Set(["172.18.0.2"]) },
      );

      expect(ip).toBe("203.0.113.7");
    });

    it("trusts nothing when the trusted proxy list is empty", () => {
      const ip = resolveClientIp(
        {
          headers: { [CLOUDFLARE_CLIENT_IP_HEADER]: "203.0.113.7" },
          remoteAddress: "127.0.0.1",
        },
        { trustedProxies: new Set<string>() },
      );

      expect(ip).toBe("127.0.0.1");
    });
  });
});
