import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { photoId } from "@waymark/domain";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { sniffImageFormat } from "./image-format.js";
import { PhotoFileStore } from "./photo-file-store.js";
import {
  PermanentProcessingFailure,
  TransientProcessingFailure,
} from "./photo-processing-failures.js";
import { RembgImageProcessor } from "./rembg-image-processor.js";
import { aCutout, aPlainImage } from "./testing/image-fixtures.js";
import {
  anUnusedSidecarUrl,
  declines,
  hangs,
  respondsWith,
  respondsWithCutout,
  respondsWithGarbage,
  startStubSidecar,
  type StubSidecar,
} from "./testing/stub-sidecar.js";

const A_PHOTO = photoId("photo-1");

/** Short, because these cases are about what happens WHEN it expires. */
const TEST_TIMEOUT_MS = 300;

describe("RembgImageProcessor", () => {
  let root: string;
  let files: PhotoFileStore;
  let sidecar: StubSidecar;
  let originalPath: string;

  const processorFor = (url: string): RembgImageProcessor =>
    new RembgImageProcessor({ baseUrl: url, files, timeoutMs: TEST_TIMEOUT_MS });

  let processor: RembgImageProcessor;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ariadna-rembg-"));
    files = new PhotoFileStore(root);
    sidecar = await startStubSidecar();
    processor = processorFor(sidecar.url);

    const stored = await files.write({
      id: A_PHOTO,
      format: "jpeg",
      original: await aPlainImage("jpeg"),
      thumbnail: await aPlainImage("jpeg", 8, 8),
    });
    originalPath = stored.originalPath;
  });

  afterEach(async () => {
    await sidecar.close();
    await rm(root, { recursive: true, force: true });
  });

  describe("the happy path", () => {
    beforeEach(async () => {
      sidecar.respondWith(respondsWithCutout(await aCutout()));
    });

    it("sends the stored original to the sidecar, unchanged", async () => {
      await processor.removeBackground(A_PHOTO, originalPath);

      const [request] = sidecar.requests;
      expect(request?.method).toBe("POST");
      expect(request?.url).toBe("/remove");
      expect(request?.body).toEqual(await files.read(originalPath));
    });

    it("answers with the path of the processed variant", async () => {
      const path = await processor.removeBackground(A_PHOTO, originalPath);

      expect(path).toBe(files.processedPathFor(A_PHOTO));
      expect(await files.read(path as string)).not.toBeNull();
    });

    /**
     * The whole point of ADR 4 for the person using this: a WHITE background,
     * not a transparent one. `rembg` answers with a cutout, so compositing is a
     * step of ours, and forgetting it is invisible in a test that only checks
     * that a file was written — the cutout would render black on a dark themed
     * phone and nowhere would anything look broken.
     */
    it("composites the cutout onto white instead of storing transparency", async () => {
      const path = (await processor.removeBackground(A_PHOTO, originalPath)) as string;
      const written = (await files.read(path)) as Buffer;

      const { data, info } = await sharp(written)
        .raw()
        .toBuffer({ resolveWithObject: true });

      expect(info.channels).toBe(3);
      expect(info.hasAlpha).toBe(false);

      // The right half was fully transparent in the cutout; it must be white.
      const topRight = (info.width - 1) * 3;
      expect(data[topRight]).toBeGreaterThan(250);
      expect(data[topRight + 1]).toBeGreaterThan(250);
      expect(data[topRight + 2]).toBeGreaterThan(250);

      // The left half was the subject, and it has to survive the compositing.
      expect(data[0]).toBeGreaterThan(200);
      expect(data[1]).toBeLessThan(60);
    });

    it("stores it as a jpeg, whatever the sidecar answered with", async () => {
      const path = (await processor.removeBackground(A_PHOTO, originalPath)) as string;

      expect(sniffImageFormat((await files.read(path)) as Buffer)).toBe("jpeg");
    });

    it("leaves the original exactly where it was", async () => {
      const before = await files.read(originalPath);

      await processor.removeBackground(A_PHOTO, originalPath);

      expect(await files.read(originalPath)).toEqual(before);
    });
  });

  describe("when the sidecar declines the job", () => {
    /**
     * The port's contract: `null` means "do not try again". A sidecar that
     * answers 204 has looked at this image and decided there is nothing to cut
     * out, and asking it a second time gets the same answer for ever.
     */
    it("answers null, which the worker records as SKIPPED", async () => {
      sidecar.respondWith(declines);

      await expect(processor.removeBackground(A_PHOTO, originalPath)).resolves.toBeNull();
    });
  });

  describe("when the sidecar is not there at all", () => {
    it("throws a transient failure, so the photo is tried again", async () => {
      const gone = processorFor(await anUnusedSidecarUrl());

      await expect(gone.removeBackground(A_PHOTO, originalPath)).rejects.toBeInstanceOf(
        TransientProcessingFailure,
      );
    });

    it("writes nothing at all", async () => {
      const gone = processorFor(await anUnusedSidecarUrl());

      await expect(gone.removeBackground(A_PHOTO, originalPath)).rejects.toThrow();
      expect(await files.read(files.processedPathFor(A_PHOTO))).toBeNull();
    });
  });

  describe("when the sidecar hangs", () => {
    /**
     * The failure that a health check never catches: the socket is accepted,
     * the connection is alive, and no answer ever comes. Without a timeout the
     * worker slot is held for ever and the queue silently stops moving while
     * every upload keeps succeeding.
     */
    it("gives up around the timeout rather than waiting for ever", async () => {
      sidecar.respondWith(hangs);

      const startedAt = Date.now();
      await expect(
        processor.removeBackground(A_PHOTO, originalPath),
      ).rejects.toBeInstanceOf(TransientProcessingFailure);

      expect(Date.now() - startedAt).toBeLessThan(TEST_TIMEOUT_MS * 10);
    });

    it("says it was a timeout, so an operator is not left guessing", async () => {
      sidecar.respondWith(hangs);

      await expect(processor.removeBackground(A_PHOTO, originalPath)).rejects.toThrow(
        /timed out/iu,
      );
    });
  });

  describe("when the sidecar answers with something unusable", () => {
    /**
     * Transient rather than permanent, and on purpose. Bytes that are not an
     * image mean the SIDECAR is wrong — a truncated response, a proxy error
     * page, a half-loaded model — not that this photo is unprocessable. The cap
     * on attempts is what stops that from becoming a loop.
     */
    it("treats garbage as a transient failure", async () => {
      sidecar.respondWith(respondsWithGarbage);

      await expect(
        processor.removeBackground(A_PHOTO, originalPath),
      ).rejects.toBeInstanceOf(TransientProcessingFailure);
    });

    it("writes no processed file when the answer could not be decoded", async () => {
      sidecar.respondWith(respondsWithGarbage);

      await expect(processor.removeBackground(A_PHOTO, originalPath)).rejects.toThrow();
      expect(await files.read(files.processedPathFor(A_PHOTO))).toBeNull();
    });

    it("treats a server error as transient", async () => {
      sidecar.respondWith(respondsWith(500, "model failed to load"));

      await expect(
        processor.removeBackground(A_PHOTO, originalPath),
      ).rejects.toBeInstanceOf(TransientProcessingFailure);
    });

    it("treats being told to slow down as transient", async () => {
      sidecar.respondWith(respondsWith(429));

      await expect(
        processor.removeBackground(A_PHOTO, originalPath),
      ).rejects.toBeInstanceOf(TransientProcessingFailure);
    });

    /**
     * The other half of the retry policy. A 4xx is the sidecar saying it read
     * this image and refuses it; the identical bytes will be refused every
     * time, so retrying is a busy loop with a fixed answer.
     */
    it.each([400, 415, 422])("treats %i as permanent", async (status) => {
      sidecar.respondWith(respondsWith(status, "cannot decode this image"));

      await expect(
        processor.removeBackground(A_PHOTO, originalPath),
      ).rejects.toBeInstanceOf(PermanentProcessingFailure);
    });
  });

  describe("when the original is not on disk", () => {
    /**
     * A row pointing at a file that is not there cannot be fixed by waiting.
     * Retrying it every few minutes for ever is the busy loop this policy
     * exists to avoid.
     */
    it("is permanent, and the sidecar is never even called", async () => {
      await expect(
        processor.removeBackground(A_PHOTO, "ab/not-there.jpg"),
      ).rejects.toBeInstanceOf(PermanentProcessingFailure);
      expect(sidecar.requests).toHaveLength(0);
    });
  });

  describe("reachability", () => {
    it("is reachable when the sidecar answers its health route", async () => {
      sidecar.respondWith(respondsWith(200, '{"status":"ok"}', "application/json"));

      await expect(processor.isReachable()).resolves.toBe(true);
      expect(sidecar.requests.at(-1)?.url).toBe("/health");
    });

    it("is not reachable when nothing is listening", async () => {
      const gone = processorFor(await anUnusedSidecarUrl());

      await expect(gone.isReachable()).resolves.toBe(false);
    });

    it("is not reachable when the sidecar answers an error", async () => {
      sidecar.respondWith(respondsWith(503));

      await expect(processor.isReachable()).resolves.toBe(false);
    });

    it("is not reachable when the sidecar hangs", async () => {
      sidecar.respondWith(hangs);

      await expect(processor.isReachable()).resolves.toBe(false);
    });
  });
});
