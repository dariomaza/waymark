import { isIP } from "node:net";

import { LOOPBACK_PROXIES } from "./http/client-ip.js";
import type { SecurityConfig } from "./http/build-app.js";

export class InvalidConfiguration extends Error {
  constructor(variable: string, reason: string) {
    super(`${variable} is invalid: ${reason}`);
    this.name = "InvalidConfiguration";
  }
}

export interface LoginRateLimitConfig {
  readonly limit: number;
  readonly windowMs: number;
}

export interface ApiConfig {
  readonly host: string;
  readonly port: number;
  /** `undefined` lets Prisma read `DATABASE_URL` from its own environment. */
  readonly databaseUrl: string | undefined;
  readonly security: SecurityConfig;
  readonly login: LoginRateLimitConfig;
}

const DEFAULTS = {
  /**
   * Loopback, not `0.0.0.0`.
   *
   * `cloudflared` holds an outbound connection to Cloudflare and forwards to
   * the API over the loopback interface, so nothing else ever needs to reach
   * this port. Binding every interface would publish a private inventory to
   * every device on the home network as a side effect of installing a tunnel,
   * and a homelab network has a printer, a TV and a guest phone on it.
   */
  host: "127.0.0.1",
  port: 3000,
  /**
   * Ten failed attempts per address per quarter of an hour.
   *
   * Generous for somebody mistyping a password on a phone keyboard in a cold
   * garage, and ruinous for a guessing run: even against a single known
   * username, ten tries per quarter hour is under a thousand a day, against a
   * password space the account holder chose freely.
   */
  loginAttemptLimit: 10,
  loginWindowMinutes: 15,
} as const;

/**
 * Configuration is read once, at startup, and every value is validated there.
 *
 * A typo in `ARIADNA_ALLOWED_ORIGINS` that silently disables CORS, or one in
 * `ARIADNA_TRUSTED_PROXIES` that silently disables the rate limiter, is a
 * security hole that looks exactly like a working deployment. Failing to start
 * is the only honest response.
 */
export const loadConfig = (env: NodeJS.ProcessEnv): ApiConfig => ({
  host: env["HOST"] ?? DEFAULTS.host,
  port: readPort(env["PORT"]),
  databaseUrl: env["DATABASE_URL"],
  security: {
    trustedProxies: readTrustedProxies(env["ARIADNA_TRUSTED_PROXIES"]),
    allowedOrigins: readAllowedOrigins(env["ARIADNA_ALLOWED_ORIGINS"]),
  },
  login: {
    limit: readPositiveInteger(
      "ARIADNA_LOGIN_ATTEMPT_LIMIT",
      env["ARIADNA_LOGIN_ATTEMPT_LIMIT"],
      DEFAULTS.loginAttemptLimit,
    ),
    windowMs:
      readPositiveInteger(
        "ARIADNA_LOGIN_WINDOW_MINUTES",
        env["ARIADNA_LOGIN_WINDOW_MINUTES"],
        DEFAULTS.loginWindowMinutes,
      ) * 60_000,
  },
});

const splitList = (raw: string): string[] =>
  raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const readPort = (raw: string | undefined): number => {
  const port = readPositiveInteger("PORT", raw, DEFAULTS.port);
  if (port > 65_535) {
    throw new InvalidConfiguration("PORT", `${port} is not a TCP port`);
  }

  return port;
};

const readPositiveInteger = (
  variable: string,
  raw: string | undefined,
  fallback: number,
): number => {
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new InvalidConfiguration(
      variable,
      `"${raw}" is not a whole number of at least 1`,
    );
  }

  return value;
};

const readTrustedProxies = (raw: string | undefined): ReadonlySet<string> => {
  if (raw === undefined) {
    return LOOPBACK_PROXIES;
  }

  const addresses = splitList(raw);
  for (const address of addresses) {
    if (isIP(address) === 0) {
      throw new InvalidConfiguration(
        "ARIADNA_TRUSTED_PROXIES",
        `"${address}" is not an IP address`,
      );
    }
  }

  return new Set(addresses);
};

/**
 * An origin is a scheme, a host and an optional port. Anything else — a path, a
 * trailing slash, a bare hostname — never matches the `Origin` header a browser
 * sends, so accepting it would produce a CORS allowlist that silently allows
 * nothing.
 */
const readAllowedOrigins = (raw: string | undefined): readonly string[] => {
  if (raw === undefined) {
    return [];
  }

  return splitList(raw).map((candidate) => {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new InvalidConfiguration(
        "ARIADNA_ALLOWED_ORIGINS",
        `"${candidate}" is not an absolute URL`,
      );
    }

    if (parsed.origin !== candidate) {
      throw new InvalidConfiguration(
        "ARIADNA_ALLOWED_ORIGINS",
        `"${candidate}" is not a bare origin; a browser would send "${parsed.origin}"`,
      );
    }

    return candidate;
  });
};
