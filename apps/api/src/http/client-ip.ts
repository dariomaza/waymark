import { isIP } from "node:net";

/**
 * The header Cloudflare puts the real caller's address in. It is a single IP,
 * never a list — unlike `X-Forwarded-For`, which is why that one is not used.
 */
export const CLOUDFLARE_CLIENT_IP_HEADER = "cf-connecting-ip";

/**
 * `cloudflared` holds an OUTBOUND connection to Cloudflare and forwards
 * requests to the API over loopback, so by default the tunnel daemon is the
 * only peer whose `CF-Connecting-IP` header is believed. Deployments that run
 * the daemon in a separate container override this with its address.
 */
export const LOOPBACK_PROXIES: ReadonlySet<string> = new Set([
  "127.0.0.1",
  "::1",
]);

/**
 * The bucket every request with no identifiable source shares.
 *
 * Making one up per request would be worse than useless: an attacker whose
 * address cannot be read would get a brand new, empty rate limit bucket on
 * every attempt. One shared bucket fails closed instead.
 */
export const UNKNOWN_CLIENT_IP = "unknown";

export interface ClientIpSource {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly remoteAddress: string | undefined;
}

export interface TrustedProxyPolicy {
  /** Peers allowed to speak for someone else. Exact addresses, no ranges. */
  readonly trustedProxies: ReadonlySet<string>;
}

/**
 * Who is actually calling.
 *
 * Behind a Cloudflare Tunnel the socket address is always the tunnel daemon,
 * so rate limiting on it would throttle Cloudflare rather than the attacker,
 * i.e. every caller in the world would share one bucket. The real address only
 * exists in `CF-Connecting-IP`.
 *
 * That header is also trivially forgeable by anyone who can reach the process
 * directly — over the LAN, or through a misconfigured port mapping — so it is
 * believed only when the peer is a configured proxy, and only when it holds
 * exactly one syntactically valid IP address. Everything else falls back to the
 * socket address, which nobody can lie about.
 */
export const resolveClientIp = (
  source: ClientIpSource,
  policy: TrustedProxyPolicy,
): string => {
  const peer = normalizeIp(source.remoteAddress);

  if (peer === null) {
    return UNKNOWN_CLIENT_IP;
  }

  if (!policy.trustedProxies.has(peer)) {
    return peer;
  }

  const forwarded = source.headers[CLOUDFLARE_CLIENT_IP_HEADER];
  if (typeof forwarded !== "string") {
    // `undefined` means Cloudflare did not send it; an array means somebody
    // upstream added a second one, and the ambiguous case is never the honest
    // one.
    return peer;
  }

  return normalizeIp(forwarded) ?? peer;
};

const IPV4_MAPPED_PREFIX = "::ffff:";

/** Returns the canonical address, or `null` when the value is not one. */
const normalizeIp = (value: string | undefined): string | null => {
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  // A dual stack socket reports an IPv4 peer as `::ffff:198.51.100.4`, which
  // would otherwise be a different rate limit key than the same caller over an
  // IPv4 socket.
  const unwrapped = trimmed.startsWith(IPV4_MAPPED_PREFIX)
    ? trimmed.slice(IPV4_MAPPED_PREFIX.length)
    : trimmed;

  return isIP(unwrapped) === 0 ? null : unwrapped;
};
