import type { ImageProcessor, PhotoId } from "@ariadna/domain";
import sharp from "sharp";

import {
  PermanentProcessingFailure,
  TransientProcessingFailure,
} from "./photo-processing-failures.js";
import type { PhotoFileStore } from "./photo-file-store.js";

/**
 * # Talking to the rembg sidecar
 *
 * The adapter ADR 4 describes: the one place in this codebase that knows there
 * is an HTTP service, a Python process and an ONNX model behind the
 * `ImageProcessor` port. `packages/domain` sees a function that takes two
 * strings and answers a third, and that is the whole of its knowledge.
 *
 * ## Why the compositing happens HERE and not in the sidecar
 *
 * `rembg` answers with a CUTOUT: the subject, and an alpha channel where the
 * background used to be. What was asked for is a WHITE background, and those
 * are not the same picture — a transparent PNG rendered on a dark themed phone
 * puts the contents of a box on black. So the alpha is flattened onto white
 * here, with the same library that already re-encodes every upload, which keeps
 * the sidecar a single-purpose thing ("remove the background") and keeps the
 * decision about what a stored photo looks like inside the application that
 * serves it.
 *
 * ## The failure taxonomy is the retry policy
 *
 * The port already draws the line: throwing means "try again later", `null`
 * means "do not". This adapter adds one distinction underneath the throw,
 * because "try again later" is wrong for a photo that will be refused every
 * single time:
 *
 * - **Transient** — nothing answered, the answer took too long, the sidecar
 *   said 5xx or 429, or what came back was not an image. Every one of those is
 *   a statement about the SIDECAR, and a sidecar can be restarted, so the photo
 *   is worth another attempt (a bounded number of them).
 * - **Permanent** — the sidecar answered 4xx: it read the image and refused it.
 *   The same bytes produce the same refusal for ever, so retrying is a busy
 *   loop with a fixed answer. A missing original is permanent for the same
 *   reason: waiting will not make a file appear.
 * - **`null`** — 204: the sidecar looked and found nothing to remove. That is a
 *   successful answer of "nothing to do", and the photo is `SKIPPED`.
 */

/** The route the sidecar exposes. See `services/image-processor/app.py`. */
const REMOVE_PATH = "/remove";
const HEALTH_PATH = "/health";

/**
 * How much of an answer this will hold in memory.
 *
 * A stored original is capped at 2048px on its longest edge, and the PNG the
 * model returns for one is a handful of megabytes. 32 MiB is far past any
 * honest answer and close enough that a sidecar streaming nonsense cannot make
 * the API process the thing that runs out of memory.
 */
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/** Matches what the ingestion path stores: visually lossless, half the bytes. */
const PROCESSED_QUALITY = 85;

/**
 * A reachability check is not a background removal and must not wait like one.
 * Two seconds answers "is the container up" and keeps `/photos/processing` fast
 * enough to be refreshed.
 */
const HEALTH_TIMEOUT_MS = 2_000;

export interface RembgImageProcessorDependencies {
  /** Origin of the sidecar, with no trailing slash. */
  readonly baseUrl: string;
  readonly files: PhotoFileStore;
  readonly timeoutMs: number;
  /** Injectable only so a test can stand in front of the network if it needs to. */
  readonly fetch?: typeof globalThis.fetch;
}

export class RembgImageProcessor implements ImageProcessor {
  readonly #deps: RembgImageProcessorDependencies;
  readonly #fetch: typeof globalThis.fetch;

  constructor(deps: RembgImageProcessorDependencies) {
    this.#deps = deps;
    this.#fetch = deps.fetch ?? globalThis.fetch;
  }

  get baseUrl(): string {
    return this.#deps.baseUrl;
  }

  async removeBackground(id: PhotoId, originalPath: string): Promise<string | null> {
    const original = await this.#deps.files.read(originalPath);
    if (original === null) {
      // The row points at a file that is not on the volume. No amount of
      // waiting produces one, so this is not a "try again later".
      throw new PermanentProcessingFailure(
        `the original of ${id} is not on disk at "${originalPath}"`,
      );
    }

    const response = await this.#post(original);

    // 204: looked at, and nothing to remove. The port spells that `null`.
    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      const detail = await readSome(response);
      // 4xx is the sidecar refusing THIS image; 408 and 429 are about timing,
      // which is a property of the moment and not of the bytes.
      if (response.status >= 400 && response.status < 500 && !isRetryableStatus(response.status)) {
        throw new PermanentProcessingFailure(
          `the sidecar refused photo ${id} with ${response.status}: ${detail}`,
        );
      }

      throw new TransientProcessingFailure(
        `the sidecar answered ${response.status} for photo ${id}: ${detail}`,
      );
    }

    const cutout = await readCapped(response, MAX_RESPONSE_BYTES);

    let onWhite: Buffer;
    try {
      onWhite = await sharp(cutout)
        // The single line ADR 4 is actually about: the alpha the model produced
        // is merged onto white, so what gets stored is a photo on a white
        // background rather than a hole.
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: PROCESSED_QUALITY, mozjpeg: true })
        .toBuffer();
    } catch (error) {
      throw new TransientProcessingFailure(
        `the sidecar answered something that is not an image for photo ${id}`,
        { cause: error },
      );
    }

    return this.#deps.files.writeProcessed(id, onWhite);
  }

  /**
   * Whether the sidecar is answering at all, for `/photos/processing`.
   *
   * It answers a question an operator would otherwise ask by SSHing in, and it
   * never throws: "I could not tell" and "it is down" are the same answer to
   * the person reading the page, and a health endpoint that can fail is one
   * more thing to debug.
   */
  async isReachable(): Promise<boolean> {
    try {
      const response = await this.#fetch(`${this.#deps.baseUrl}${HEALTH_PATH}`, {
        method: "GET",
        signal: AbortSignal.timeout(Math.min(this.#deps.timeoutMs, HEALTH_TIMEOUT_MS)),
      });
      // The body is not read: a health check that buffers is a health check
      // that can hang on a body that never ends.
      await response.body?.cancel();

      return response.ok;
    } catch {
      return false;
    }
  }

  async #post(original: Buffer): Promise<Response> {
    try {
      return await this.#fetch(`${this.#deps.baseUrl}${REMOVE_PATH}`, {
        method: "POST",
        // Raw bytes, not multipart. There is one file and no fields, so a
        // multipart envelope would only add an encoder here and a parser there
        // for a boundary nobody needs.
        headers: {
          "content-type": "application/octet-stream",
          accept: "image/png",
        },
        body: new Uint8Array(original),
        // The timeout covers the connection AND the body, which is what makes
        // it catch the case that matters: a socket that was accepted and then
        // went quiet.
        signal: AbortSignal.timeout(this.#deps.timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error)) {
        throw new TransientProcessingFailure(
          `the sidecar timed out after ${this.#deps.timeoutMs}ms`,
          { cause: error },
        );
      }

      throw new TransientProcessingFailure(
        `the sidecar at ${this.#deps.baseUrl} could not be reached`,
        { cause: error },
      );
    }
  }
}

const isRetryableStatus = (status: number): boolean => status === 408 || status === 429;

const isTimeout = (error: unknown): boolean => {
  const name = (error as { name?: string } | null)?.name;

  return name === "TimeoutError" || name === "AbortError";
};

/** A short excerpt of an error body, for the log line. Never the whole thing. */
const readSome = async (response: Response): Promise<string> => {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return "<unreadable>";
  }
};

/**
 * Buffers a response, refusing to grow past a cap.
 *
 * `arrayBuffer()` would read whatever arrives, so a sidecar answering an
 * endless stream would be answered with the API process being killed by the
 * out-of-memory reaper. Counting while reading is what bounds it.
 */
const readCapped = async (response: Response, maxBytes: number): Promise<Buffer> => {
  const body = response.body;
  if (body === null) {
    return Buffer.alloc(0);
  }

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new TransientProcessingFailure(
        `the sidecar answered more than ${maxBytes} bytes`,
      );
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
};
