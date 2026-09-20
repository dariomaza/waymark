import { createHash } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * # Caching for the binary routes
 *
 * QR symbols and photos are the only responses this API sends that are worth
 * caching at all: everything else is inventory state that changes the moment
 * somebody moves a box. They are also the only responses big enough for a phone
 * on mobile data to care.
 *
 * `private` on every one of them. These responses sit behind a session and
 * describe the inside of somebody's house; a shared cache — a corporate proxy,
 * a CDN, the Cloudflare edge the tunnel terminates at — must never hold one and
 * hand it to the next caller. `public` here would be a data leak dressed up as
 * a performance win.
 */

/**
 * A stored image never changes. The bytes behind a photo id are written once at
 * upload and are never rewritten: an edit produces a NEW photo with a new id,
 * and a delete removes the id entirely. That is exactly the precondition
 * `immutable` states, so a client may skip revalidation for as long as it likes.
 */
export const IMMUTABLE_CACHE_CONTROL = "private, max-age=31536000, immutable";

/**
 * A QR symbol is derived, not stored: it is a function of the public id AND of
 * `ARIADNA_PUBLIC_BASE_URL`, which a redeploy can change. An hour of freshness
 * plus a revalidation keeps the label cheap to fetch without pinning a picture
 * of a dead URL into a phone's cache for a year.
 */
export const DERIVED_CACHE_CONTROL = "private, max-age=3600, must-revalidate";

/** A strong validator: same tag means byte-identical body, by construction. */
export const etagOf = (...parts: readonly string[]): string =>
  `"${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32)}"`;

/**
 * Whether the client already holds this exact body.
 *
 * `If-None-Match` may carry a list, and a cache is allowed to weaken a strong
 * tag to `W/"..."`, so both forms are accepted. `*` means "any representation",
 * which for a single-representation resource means the one being served.
 */
export const isFresh = (request: FastifyRequest, etag: string): boolean => {
  const header = request.headers["if-none-match"];
  if (typeof header !== "string") {
    return false;
  }

  return header
    .split(",")
    .map((candidate) => candidate.trim().replace(/^W\//u, ""))
    .some((candidate) => candidate === "*" || candidate === etag);
};

export interface CachedBinaryResponse {
  readonly etag: string;
  readonly cacheControl: string;
  readonly contentType: string;
  readonly contentLength?: number;
}

/**
 * Sets the validators and returns whether a 304 was sent.
 *
 * A 304 carries no body, and the caller must not try to send one afterwards —
 * which is why this returns a boolean rather than hiding the branch.
 */
export const sendUnchangedOrPrepare = (
  request: FastifyRequest,
  reply: FastifyReply,
  response: CachedBinaryResponse,
): boolean => {
  reply.header("etag", response.etag);
  reply.header("cache-control", response.cacheControl);

  if (isFresh(request, response.etag)) {
    void reply.code(304).send();
    return true;
  }

  reply.header("content-type", response.contentType);
  if (response.contentLength !== undefined) {
    reply.header("content-length", String(response.contentLength));
  }

  return false;
};
