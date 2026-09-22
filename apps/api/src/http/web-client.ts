import { readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";

import type { FastifyReply, FastifyRequest } from "fastify";

import {
  etagOf,
  IMMUTABLE_ASSET_CACHE_CONTROL,
  REVALIDATED_ASSET_CACHE_CONTROL,
  sendUnchangedOrPrepare,
} from "./caching.js";

/**
 * # Serving the built web client
 *
 * `apps/web/dist` as Vite leaves it: one `index.html`, a handful of files
 * under `assets/` whose names are their content hashes, and the service
 * worker, the manifest and the icons at the root. This module answers for
 * exactly those bytes and refuses everything else, and the refusals are the
 * half worth reading.
 */

export interface WebClientConfig {
  /** The built client's directory. `apps/web/dist`, or a volume in a test. */
  readonly root: string;
}

/**
 * The shell's own policy, and the only response in this process that gets one
 * allowing anything at all.
 *
 * Every JSON answer stays under `default-src 'none'` (see `build-app.ts`),
 * which is right for a response nothing should ever load anything on behalf
 * of. A document is the opposite: it exists to load its bundle, its
 * stylesheet, its manifest and its service worker, and a policy that refused
 * those would refuse the app.
 *
 * - `'self'` throughout, with no host allowlist, because the whole point of
 *   serving the client here is that there is exactly one origin now. The API
 *   it talks to IS this origin, so `connect-src 'self'` covers every request
 *   the app makes.
 * - `blob:` on images, because every photo in this app is fetched with the
 *   session token and handed to the DOM as an object URL — a plain `<img
 *   src>` at `/photos/:id` would answer 401.
 * - `'unsafe-inline'` on styles ONLY. One screen computes an indentation as a
 *   `style` attribute, and a style attribute is inline style as far as CSP is
 *   concerned. `style-src-attr` would be the precise directive, and Firefox
 *   only learned it recently — an unsupported directive falls back to
 *   `style-src`, and the failure is a silently unindented tree rather than an
 *   error anybody sees. Scripts get no such concession, which is where XSS
 *   lives: no `'unsafe-inline'`, no `'unsafe-eval'`, no hosts.
 */
export const DOCUMENT_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join(";");

/**
 * Vite's content hash: eight base64url characters between the name and the
 * extension, as in `index-D1lYCQ-q.js` and `workbox-63c18b4d.js`.
 *
 * Anchored to exactly eight so that a name which merely CONTAINS a dash is
 * not mistaken for a hashed one — `apple-touch-icon.png` and `icon-192.png`
 * are both in a real build, and a looser rule would pin both into a phone's
 * cache for a year.
 *
 * The asymmetry is deliberate: a hash this rule fails to recognise costs one
 * conditional request, and a name it recognises wrongly costs a year of the
 * wrong bytes. When in doubt, revalidate.
 */
const CONTENT_HASHED = /-[A-Za-z0-9_-]{8}\.[^./]+$/u;

/**
 * The extensions a Vite build emits, and nothing else. An unknown extension
 * is served as bytes rather than guessed at, because the one guess that
 * matters is the one that turns an upload into an HTML document.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

const SHELL = "index.html";

interface ServableFile {
  readonly body: Buffer;
  readonly etag: string;
  readonly contentType: string;
  readonly cacheControl: string;
  readonly isDocument: boolean;
}

export interface WebClient {
  /**
   * Answers whether this request was served.
   *
   * `false` means "not mine, and not a page either" — a file that is not
   * there, or a path that tried to leave the root — and the caller turns that
   * into the same JSON 404 the API has always sent. Returning a boolean
   * rather than sending the 404 here keeps one place in charge of what a
   * refusal looks like.
   */
  send(request: FastifyRequest, reply: FastifyReply, pathname: string): boolean;
}

export class MissingWebClient extends Error {
  constructor(root: string) {
    super(
      `ARIADNA_WEB_ROOT is ${root}, which holds no ${SHELL}. Build the client with \`pnpm --filter @waymark/web build\`, or leave the variable unset to run the API on its own.`,
    );
    this.name = "MissingWebClient";
  }
}

/**
 * Reads the client off disk once, at startup.
 *
 * Failing here rather than on the first request is the point: a container
 * whose image was built without the client is broken, and it should say so in
 * its first log line instead of answering 404 to somebody standing in a
 * garage. The files are the image's own content and a built PWA is a few
 * hundred kilobytes, so they are held in memory — which is also what lets the
 * ETag be a real hash of the bytes rather than a guess from a timestamp.
 */
export const createWebClient = (config: WebClientConfig): WebClient => {
  const root = resolve(config.root);
  const files = new Map<string, ServableFile>();

  /**
   * Only a HIT is remembered.
   *
   * Caching the misses too would be the obvious symmetry and it is a slow
   * memory leak with a stranger's hand on the tap: the key is a path from the
   * request, so a caller asking for `/a1.js`, `/a2.js`, `/a3.js` forever
   * would grow this map forever. The set of hits, by contrast, is fixed by
   * what the image contains.
   *
   * A miss costs one `stat` that answers ENOENT, which is what a 404 is worth.
   */
  const read = (absolutePath: string): ServableFile | null => {
    const known = files.get(absolutePath);
    if (known !== undefined) {
      return known;
    }

    const file = load(absolutePath);
    if (file !== null) {
      files.set(absolutePath, file);
    }

    return file;
  };

  const shell = read(join(root, SHELL));
  if (shell === null) {
    throw new MissingWebClient(root);
  }

  return {
    send(request, reply, pathname): boolean {
      const requested = resolveInside(root, pathname);
      if (requested === null) {
        return false;
      }

      const file = requested === root ? null : read(requested);
      if (file !== null) {
        respond(request, reply, file);
        return true;
      }

      /**
       * A path whose last segment carries an extension is a request for a
       * FILE, and a file that is not there is not a client route. This is the
       * other half of the `unexpected token <` bug: a phone holding a shell
       * from before the last deploy asks for a chunk that no longer exists,
       * and a shell served in its place is an HTML document arriving where a
       * module was expected.
       */
      if (extname(basename(pathname)) !== "") {
        return false;
      }

      respond(request, reply, shell);
      return true;
    },
  };
};

const respond = (
  request: FastifyRequest,
  reply: FastifyReply,
  file: ServableFile,
): void => {
  if (file.isDocument) {
    reply.header("content-security-policy", DOCUMENT_CONTENT_SECURITY_POLICY);
  }

  const unchanged = sendUnchangedOrPrepare(request, reply, {
    etag: file.etag,
    cacheControl: file.cacheControl,
    contentType: file.contentType,
    contentLength: file.body.byteLength,
  });
  if (unchanged) {
    return;
  }

  // A HEAD asks what a GET would answer, and answers it with headers alone.
  void reply.send(request.method === "HEAD" ? undefined : file.body);
};

const load = (absolutePath: string): ServableFile | null => {
  let body: Buffer;
  try {
    if (!statSync(absolutePath).isFile()) {
      return null;
    }

    body = readFileSync(absolutePath);
  } catch {
    return null;
  }

  const name = basename(absolutePath);

  return {
    body,
    etag: etagOf(name, body.toString("base64")),
    contentType: CONTENT_TYPES[extname(name).toLowerCase()] ?? "application/octet-stream",
    cacheControl: CONTENT_HASHED.test(name)
      ? IMMUTABLE_ASSET_CACHE_CONTROL
      : REVALIDATED_ASSET_CACHE_CONTROL,
    isDocument: name === SHELL,
  };
};

/**
 * The requested path as an absolute path inside the root, or `null`.
 *
 * Two things are refused rather than normalised away. A path that resolves
 * outside the root is a traversal — `resolve` collapses `..` for us, and the
 * prefix check is what turns that into a refusal instead of a file from the
 * image. A NUL byte is refused because it truncates a path in some of the
 * layers underneath, so the name that is checked and the name that is opened
 * would be different strings.
 */
const resolveInside = (root: string, pathname: string): string | null => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded.includes("\0")) {
    return null;
  }

  const candidate = resolve(root, `.${decoded.startsWith("/") ? "" : "/"}${decoded}`);

  return candidate === root || candidate.startsWith(`${root}${sep}`)
    ? candidate
    : null;
};
