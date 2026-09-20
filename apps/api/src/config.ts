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

export interface PhotoConfig {
  /** The directory photo files live in. A Docker volume in production. */
  readonly root: string;
  /** The largest single upload this service will accept, in bytes. */
  readonly maxBytes: number;
}

export interface ApiConfig {
  readonly host: string;
  readonly port: number;
  /** `undefined` lets Prisma read `DATABASE_URL` from its own environment. */
  readonly databaseUrl: string | undefined;
  /**
   * Where a scanned QR code sends a phone. Never trailing-slashed, so
   * `storageUnitUrl` can append without thinking about it.
   */
  readonly publicBaseUrl: string;
  readonly security: SecurityConfig;
  readonly login: LoginRateLimitConfig;
  readonly photos: PhotoConfig;
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
  /**
   * The Vite dev server for the PWA.
   *
   * A QR code is a picture of a URL, and the URL has to point at the PAGE a
   * person should land on, which is the web client, not this API. Until the
   * tunnel hostname exists, a developer's own machine is the only honest
   * answer; a placeholder domain would print labels that lead nowhere and look
   * exactly like working ones.
   */
  publicBaseUrl: "http://localhost:5173",
  /**
   * Relative to the working directory, so a checkout runs with no setup. The
   * container mounts a volume and points `ARIADNA_PHOTO_ROOT` at it; the files
   * must not live inside the image, or an upgrade deletes the photos.
   */
  photoRoot: "data/photos",
  /**
   * Twelve megabytes.
   *
   * A 50 megapixel phone photo is 8-10 MB, so this accepts anything somebody
   * actually points a camera at. It is also small enough that filling a homelab
   * disk through this endpoint takes real effort, and small enough that the
   * decode-and-resize on the way in cannot be used to pin the CPU.
   */
  maxPhotoMegabytes: 12,
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
  publicBaseUrl: readPublicBaseUrl(env["ARIADNA_PUBLIC_BASE_URL"]),
  security: {
    trustedProxies: readTrustedProxies(env["ARIADNA_TRUSTED_PROXIES"]),
    allowedOrigins: readAllowedOrigins(env["ARIADNA_ALLOWED_ORIGINS"]),
  },
  photos: {
    root: readPhotoRoot(env["ARIADNA_PHOTO_ROOT"]),
    maxBytes:
      readPositiveInteger(
        "ARIADNA_MAX_PHOTO_MB",
        env["ARIADNA_MAX_PHOTO_MB"],
        DEFAULTS.maxPhotoMegabytes,
      ) *
      1024 *
      1024,
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

/**
 * The base a scanned label resolves against.
 *
 * It is checked hard, because the failure mode is silent and physical: a base
 * URL that parses but is wrong produces stickers that get glued to boxes and
 * only reveal themselves months later, when somebody scans one and gets a
 * connection error in a garage. A path prefix is allowed (an app served under
 * `/ariadna`); a query, a fragment or a non-HTTP scheme is not, because none of
 * them survives having `/u/<publicId>` appended.
 */
const readPublicBaseUrl = (raw: string | undefined): string => {
  if (raw === undefined || raw.trim().length === 0) {
    return DEFAULTS.publicBaseUrl;
  }

  const candidate = raw.trim();

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new InvalidConfiguration(
      "ARIADNA_PUBLIC_BASE_URL",
      `"${candidate}" is not an absolute URL`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidConfiguration(
      "ARIADNA_PUBLIC_BASE_URL",
      `"${candidate}" is not an http(s) URL, and a phone camera will not open it`,
    );
  }

  if (parsed.search !== "" || parsed.hash !== "") {
    throw new InvalidConfiguration(
      "ARIADNA_PUBLIC_BASE_URL",
      `"${candidate}" carries a query or a fragment, which cannot survive appending a path`,
    );
  }

  return candidate.replace(/\/+$/u, "");
};

/**
 * Where photo files live.
 *
 * Only emptiness is refused, and deliberately: whether the path exists, is
 * writable or is even mounted is not knowable at config time in a container
 * that has not started yet, and the store creates what it needs on first write.
 * An empty value, though, would silently mean the working directory, and
 * scattering photos next to the source is worse than failing to start.
 */
const readPhotoRoot = (raw: string | undefined): string => {
  if (raw === undefined) {
    return DEFAULTS.photoRoot;
  }

  const root = raw.trim();
  if (root.length === 0) {
    throw new InvalidConfiguration(
      "ARIADNA_PHOTO_ROOT",
      "it is empty, which would scatter photo files into the working directory",
    );
  }

  return root;
};
