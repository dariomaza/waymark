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

/**
 * Background removal, which is optional in the strongest sense (ADR 4): with no
 * sidecar address configured, nothing here runs at all and every photo is
 * served from the original it was uploaded as.
 */
export interface ImageProcessingConfig {
  /** `null` means switched off. Never trailing-slashed. */
  readonly url: string | null;
  /** How long a single background removal may take before it is abandoned. */
  readonly timeoutMs: number;
  /** How many photos may be in flight at the sidecar at the same time. */
  readonly concurrency: number;
  /** Attempts at one photo before it is marked `FAILED` and left alone. */
  readonly maxAttempts: number;
  /** How often the worker looks for photos nobody has processed yet. */
  readonly pollIntervalMs: number;
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
  readonly imageProcessing: ImageProcessingConfig;
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
  /**
   * Two minutes for one background removal.
   *
   * rembg decodes the image, runs a U²-Net forward pass on the CPU and encodes
   * a mask. On a homelab x86 box that is two to six seconds for a 2048px photo;
   * on the ARM board this may end up on, twenty or thirty. Two minutes is an
   * order of magnitude past the worst honest case, which is what a timeout is
   * for: it exists to notice a sidecar that has STOPPED answering, not to
   * second-guess a slow one. Without it, a hung read holds a worker slot for
   * ever and the queue stops moving while every request still succeeds — the
   * failure that looks exactly like everything working.
   */
  imageProcessorTimeoutSeconds: 120,
  /**
   * One photo at a time.
   *
   * onnxruntime already uses every core for a single forward pass, so a second
   * concurrent image buys no throughput at all: it halves the speed of both and
   * doubles the resident memory, on the same small box that is serving the API,
   * the database and the photo volume. The bound is the point — an unbounded
   * fan-out over a backlog of two hundred photos would take the machine down,
   * and a homelab has no autoscaler to hide behind.
   */
  imageProcessorConcurrency: 1,
  /**
   * Five attempts, then the photo is left alone.
   *
   * With the backoff in `PhotoProcessingWorker` that spans about a quarter of an
   * hour, which covers a sidecar restart, an image pull or a reboot, and stops
   * well short of retrying a genuinely broken photo for ever. What comes after
   * is not silence: the photo becomes `FAILED`, the reason is kept, and the
   * retry route exists precisely so a person can say "try again" once the cause
   * is fixed (ADR 4).
   */
  imageProcessorMaxAttempts: 5,
  /**
   * Fifteen seconds between sweeps for work nobody has claimed.
   *
   * Uploads wake the worker immediately, so this interval is not the latency of
   * a normal photo; it is how long a photo waits when the wake-up was lost — a
   * restart, a crash mid-flight, a lease that expired. One indexed query every
   * fifteen seconds is free next to one background removal.
   */
  imageProcessorPollSeconds: 15,
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
  imageProcessing: {
    url: readImageProcessorUrl(env["ARIADNA_IMAGE_PROCESSOR_URL"]),
    timeoutMs:
      readPositiveInteger(
        "ARIADNA_IMAGE_PROCESSOR_TIMEOUT_SECONDS",
        env["ARIADNA_IMAGE_PROCESSOR_TIMEOUT_SECONDS"],
        DEFAULTS.imageProcessorTimeoutSeconds,
      ) * 1_000,
    concurrency: readPositiveInteger(
      "ARIADNA_IMAGE_PROCESSOR_CONCURRENCY",
      env["ARIADNA_IMAGE_PROCESSOR_CONCURRENCY"],
      DEFAULTS.imageProcessorConcurrency,
    ),
    maxAttempts: readPositiveInteger(
      "ARIADNA_IMAGE_PROCESSOR_MAX_ATTEMPTS",
      env["ARIADNA_IMAGE_PROCESSOR_MAX_ATTEMPTS"],
      DEFAULTS.imageProcessorMaxAttempts,
    ),
    pollIntervalMs:
      readPositiveInteger(
        "ARIADNA_IMAGE_PROCESSOR_POLL_SECONDS",
        env["ARIADNA_IMAGE_PROCESSOR_POLL_SECONDS"],
        DEFAULTS.imageProcessorPollSeconds,
      ) * 1_000,
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
 * The address of the rembg sidecar, or nothing at all.
 *
 * Absence is a valid, complete configuration and the reason this variable is
 * the on/off switch rather than a separate `ARIADNA_IMAGE_PROCESSING_ENABLED`:
 * two settings that can disagree ("enabled, with no address") is one more state
 * than the feature has, and the extra state is always the one that breaks.
 *
 * What IS refused is a half-written address, for the same reason every other
 * value here is: a sidecar URL that parses but is wrong produces a deployment
 * where every photo silently fails to be processed and nothing says why.
 */
const readImageProcessorUrl = (raw: string | undefined): string | null => {
  if (raw === undefined || raw.trim().length === 0) {
    return null;
  }

  const candidate = raw.trim();

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new InvalidConfiguration(
      "ARIADNA_IMAGE_PROCESSOR_URL",
      `"${candidate}" is not an absolute URL`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidConfiguration(
      "ARIADNA_IMAGE_PROCESSOR_URL",
      `"${candidate}" is not an http(s) URL`,
    );
  }

  if (parsed.search !== "" || parsed.hash !== "") {
    throw new InvalidConfiguration(
      "ARIADNA_IMAGE_PROCESSOR_URL",
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
