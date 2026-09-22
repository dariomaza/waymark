import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createPhoto,
  markPhotoFailed,
  markPhotoProcessed,
  photoId,
  PhotoProcessingStatus,
  type Photo,
  type PhotoId,
} from "@waymark/domain";
import { FakeClock } from "@waymark/domain/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaPhotoRepository } from "../persistence/prisma-photo-repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../persistence/testing/test-database.js";
import { PhotoFileStore } from "./photo-file-store.js";
import { PrismaPhotoProcessingQueue } from "./photo-processing-queue.js";
import {
  PhotoProcessingWorker,
  backoffFor,
  RETRY_BACKOFF_BASE_MS,
} from "./photo-processing-worker.js";
import { RembgImageProcessor } from "./rembg-image-processor.js";
import { aCutout, aPlainImage } from "./testing/image-fixtures.js";
import {
  anUnusedSidecarUrl,
  declines,
  respondsWith,
  respondsWithCutout,
  respondsWithGarbage,
  startStubSidecar,
  type SidecarHandler,
  type StubSidecar,
} from "./testing/stub-sidecar.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");
const MAX_ATTEMPTS = 3;
const SIDECAR_TIMEOUT_MS = 300;

/**
 * A worker over the real Prisma repositories, a real temporary photo
 * directory, a real HTTP sidecar on a loopback port and a clock the test moves
 * by hand. The only thing that is not real is the passage of time, because a
 * test that waits out a five minute backoff is a test nobody runs.
 */
describe("PhotoProcessingWorker", () => {
  let database: TestDatabase;
  let photos: PrismaPhotoRepository;
  let queue: PrismaPhotoProcessingQueue;
  let root: string;
  let files: PhotoFileStore;
  let sidecar: StubSidecar;
  let clock: FakeClock;
  let cutout: Buffer;

  beforeAll(async () => {
    database = await createTestDatabase();
    photos = new PrismaPhotoRepository(database.client);
    queue = new PrismaPhotoProcessingQueue(database.client);
    cutout = await aCutout();
  });

  afterAll(async () => {
    await database.destroy();
  });

  beforeEach(async () => {
    await database.reset();
    root = await mkdtemp(join(tmpdir(), "ariadna-worker-"));
    files = new PhotoFileStore(root);
    sidecar = await startStubSidecar(respondsWithCutout(cutout));
    clock = new FakeClock(NOW);
  });

  afterEach(async () => {
    await sidecar.close();
    await rm(root, { recursive: true, force: true });
  });

  const workerFor = (
    overrides: {
      readonly baseUrl?: string;
      readonly concurrency?: number;
      readonly maxAttempts?: number;
      readonly pollIntervalMs?: number;
    } = {},
  ): PhotoProcessingWorker =>
    new PhotoProcessingWorker({
      photos,
      queue,
      clock,
      processor: new RembgImageProcessor({
        baseUrl: overrides.baseUrl ?? sidecar.url,
        files,
        timeoutMs: SIDECAR_TIMEOUT_MS,
      }),
      concurrency: overrides.concurrency ?? 1,
      maxAttempts: overrides.maxAttempts ?? MAX_ATTEMPTS,
      pollIntervalMs: overrides.pollIntervalMs ?? 60_000,
      leaseMs: 60_000,
    });

  const aStoredPhoto = async (id = "photo-1"): Promise<Photo> => {
    const stored = await files.write({
      id: photoId(id),
      format: "jpeg",
      original: await aPlainImage("jpeg"),
      thumbnail: await aPlainImage("jpeg", 8, 8),
    });
    const photo = createPhoto({ id: photoId(id), ...stored });
    await photos.save(photo);

    return photo;
  };

  const reload = async (id: PhotoId): Promise<Photo> => {
    const photo = await photos.findById(id);
    if (photo === null) {
      throw new Error(`photo ${id} is gone`);
    }

    return photo;
  };

  describe("a photo that can be processed", () => {
    it("ends up DONE, pointing at the processed file", async () => {
      const photo = await aStoredPhoto();

      await workerFor().runOnce();

      const after = await reload(photo.id);
      expect(after.processingStatus).toBe(PhotoProcessingStatus.DONE);
      expect(after.processedPath).toBe(files.processedPathFor(photo.id));
      expect(await files.read(after.processedPath as string)).not.toBeNull();
    });

    it("keeps its original, which is what every read falls back to", async () => {
      const photo = await aStoredPhoto();

      await workerFor().runOnce();

      expect(await files.read((await reload(photo.id)).originalPath)).not.toBeNull();
    });

    it("leaves no bookkeeping behind", async () => {
      await aStoredPhoto();

      await workerFor().runOnce();

      expect(await database.client.photoProcessingAttempt.count()).toBe(0);
    });

    it("is not looked at twice", async () => {
      await aStoredPhoto();
      const worker = workerFor();

      await worker.runOnce();
      await worker.runOnce();

      expect(sidecar.requests.filter((request) => request.url === "/remove")).toHaveLength(1);
    });
  });

  describe("photos it must not touch", () => {
    it.each([
      ["DONE", (photo: Photo): Photo => markPhotoProcessed(photo, "ab/x.processed.jpg")],
      ["FAILED", markPhotoFailed],
    ])("never reprocesses a %s photo", async (_status, mark) => {
      await photos.save(mark(await aStoredPhoto()));

      const summary = await workerFor().runOnce();

      expect(summary.claimed).toBe(0);
      expect(sidecar.requests).toHaveLength(0);
    });

    it("shrugs at a photo that was deleted while it was queued", async () => {
      const photo = await aStoredPhoto();
      await database.client.photoProcessingAttempt.create({
        data: {
          photoId: photo.id,
          attempts: 0,
          nextAttemptAt: NOW,
          updatedAt: NOW,
        },
      });
      await photos.deleteMany([photo.id]);

      await expect(workerFor().runOnce()).resolves.toMatchObject({ claimed: 0 });
      expect(await database.client.photoProcessingAttempt.count()).toBe(0);
    });
  });

  describe("when the sidecar declines the photo", () => {
    it("records SKIPPED and never asks again", async () => {
      sidecar.respondWith(declines);
      const photo = await aStoredPhoto();
      const worker = workerFor();

      await worker.runOnce();
      await worker.runOnce();

      expect((await reload(photo.id)).processingStatus).toBe(
        PhotoProcessingStatus.SKIPPED,
      );
      expect(sidecar.requests).toHaveLength(1);
    });
  });

  describe("when the sidecar is down", () => {
    /**
     * The property ADR 4 exists for, seen from the worker's side: a sidecar
     * that is not there costs a retry, and nothing else. The photo keeps its
     * original, keeps being served, and keeps its place in the queue.
     */
    it("leaves the photo PENDING rather than failing it", async () => {
      const photo = await aStoredPhoto();

      await workerFor({ baseUrl: await anUnusedSidecarUrl() }).runOnce();

      expect((await reload(photo.id)).processingStatus).toBe(
        PhotoProcessingStatus.PENDING,
      );
    });

    it("does not try again immediately, which would be a busy loop", async () => {
      await aStoredPhoto();
      const worker = workerFor({ baseUrl: await anUnusedSidecarUrl() });

      await worker.runOnce();
      const second = await worker.runOnce();

      expect(second.claimed).toBe(0);
    });

    it("tries again once the backoff has passed", async () => {
      await aStoredPhoto();
      const worker = workerFor({ baseUrl: await anUnusedSidecarUrl() });
      await worker.runOnce();

      clock.advanceBy(RETRY_BACKOFF_BASE_MS + 1);

      expect((await worker.runOnce()).claimed).toBe(1);
    });

    /**
     * Retrying for ever would be the busy loop; giving up silently would be the
     * lie. The photo becomes FAILED, the reason is kept, and `/photos/processing`
     * is where a person sees both.
     */
    it("gives up after the configured number of attempts, and says why", async () => {
      const photo = await aStoredPhoto();
      const worker = workerFor({ baseUrl: await anUnusedSidecarUrl() });

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        await worker.runOnce();
        clock.advanceBy(backoffFor(attempt) + 1);
      }

      expect((await reload(photo.id)).processingStatus).toBe(
        PhotoProcessingStatus.FAILED,
      );
      const [abandoned] = await queue.abandoned(10);
      expect(abandoned?.attempts).toBe(MAX_ATTEMPTS);
      expect(abandoned?.lastError).toMatch(/could not be reached/u);
    });

    it("stops claiming it once it has given up", async () => {
      await aStoredPhoto();
      const worker = workerFor({ baseUrl: await anUnusedSidecarUrl() });

      for (let attempt = 1; attempt <= MAX_ATTEMPTS + 2; attempt += 1) {
        await worker.runOnce();
        clock.advanceBy(RETRY_BACKOFF_BASE_MS * 100);
      }

      expect((await worker.runOnce()).claimed).toBe(0);
    });
  });

  describe("when the sidecar refuses the image", () => {
    /**
     * The distinction the retry policy is made of. A 4xx is an answer about
     * these bytes, and it will be the same answer next week: spending five
     * attempts and twenty minutes of backoff on it buys nothing.
     */
    it("fails the photo on the first attempt, without retrying", async () => {
      sidecar.respondWith(respondsWith(415, "cannot decode this image"));
      const photo = await aStoredPhoto();
      const worker = workerFor();

      await worker.runOnce();
      clock.advanceBy(RETRY_BACKOFF_BASE_MS * 10);
      await worker.runOnce();

      expect((await reload(photo.id)).processingStatus).toBe(
        PhotoProcessingStatus.FAILED,
      );
      expect(sidecar.requests.filter((request) => request.url === "/remove")).toHaveLength(1);
      expect((await queue.abandoned(10))[0]?.attempts).toBe(1);
    });
  });

  describe("when the sidecar answers nonsense", () => {
    it("retries it, because that is a broken sidecar and not a broken photo", async () => {
      sidecar.respondWith(respondsWithGarbage);
      const photo = await aStoredPhoto();
      const worker = workerFor();

      await worker.runOnce();

      expect((await reload(photo.id)).processingStatus).toBe(
        PhotoProcessingStatus.PENDING,
      );
      expect((await queue.abandoned(10))).toHaveLength(0);
    });
  });

  describe("backpressure", () => {
    /**
     * rembg is CPU bound and this is one small box. An unbounded fan-out over a
     * backlog is how a machine that was merely slow becomes a machine that is
     * down, and nothing in the photo path would have warned anybody first.
     */
    it("never has more than the configured number of photos in flight", async () => {
      const inFlight = trackConcurrency(cutout);
      sidecar.respondWith(inFlight.handler);
      for (const id of ["photo-1", "photo-2", "photo-3", "photo-4", "photo-5"]) {
        await aStoredPhoto(id);
      }

      await workerFor({ concurrency: 2 }).runOnce();

      expect(inFlight.peak).toBe(2);
    });

    it("still drains a backlog larger than the bound", async () => {
      for (const id of ["photo-1", "photo-2", "photo-3", "photo-4", "photo-5"]) {
        await aStoredPhoto(id);
      }

      const summary = await workerFor({ concurrency: 2 }).runOnce();

      expect(summary.processed).toBe(5);
      expect(await queue.counts()).toMatchObject({ DONE: 5, PENDING: 0 });
    });

    it("processes one photo at a time when told to", async () => {
      const inFlight = trackConcurrency(cutout);
      sidecar.respondWith(inFlight.handler);
      await aStoredPhoto("photo-1");
      await aStoredPhoto("photo-2");

      await workerFor({ concurrency: 1 }).runOnce();

      expect(inFlight.peak).toBe(1);
    });
  });

  describe("more than one worker", () => {
    /**
     * Two runs overlapping is not hypothetical: an upload wakes the worker
     * while the poll timer is already running one. The lease is what makes that
     * safe, and the sidecar counting requests is what proves it.
     */
    it("never sends the same photo to the sidecar twice", async () => {
      await aStoredPhoto("photo-1");

      await Promise.all([workerFor().runOnce(), workerFor().runOnce()]);

      expect(sidecar.requests.filter((request) => request.url === "/remove")).toHaveLength(1);
    });

    it("refuses to run itself twice at the same time", async () => {
      await aStoredPhoto("photo-1");
      const worker = workerFor();

      const [first, second] = await Promise.all([worker.runOnce(), worker.runOnce()]);

      expect(first.claimed + second.claimed).toBe(1);
    });
  });

  describe("surviving a restart", () => {
    /**
     * Nothing is held in memory, so "the process died with photos in it" is not
     * a case that needs recovering: the queue is the photo table, and a new
     * worker sees exactly what the old one saw.
     */
    it("picks up photos the previous process left PENDING", async () => {
      const photo = await aStoredPhoto();
      // A worker that claimed the photo and died before answering.
      await workerFor({ baseUrl: await anUnusedSidecarUrl() }).runOnce();

      clock.advanceBy(RETRY_BACKOFF_BASE_MS + 1);
      await workerFor().runOnce();

      expect((await reload(photo.id)).processingStatus).toBe(PhotoProcessingStatus.DONE);
    });
  });

  describe("running on its own", () => {
    it("processes a photo after being woken, without anybody calling runOnce", async () => {
      const photo = await aStoredPhoto();
      const worker = workerFor({ pollIntervalMs: 20 });

      worker.start();
      worker.wake();
      try {
        await eventually(async () => {
          expect((await reload(photo.id)).processingStatus).toBe(
            PhotoProcessingStatus.DONE,
          );
        });
      } finally {
        worker.stop();
      }
    });

    it("finds work nobody woke it for", async () => {
      const worker = workerFor({ pollIntervalMs: 20 });
      worker.start();
      const photo = await aStoredPhoto();

      try {
        await eventually(async () => {
          expect((await reload(photo.id)).processingStatus).toBe(
            PhotoProcessingStatus.DONE,
          );
        });
      } finally {
        worker.stop();
      }
    });

    it("stops when it is stopped", async () => {
      const worker = workerFor({ pollIntervalMs: 20 });
      worker.start();
      worker.stop();

      const photo = await aStoredPhoto();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect((await reload(photo.id)).processingStatus).toBe(
        PhotoProcessingStatus.PENDING,
      );
    });
  });
});

/** A sidecar that takes its time, and remembers how many were in it at once. */
const trackConcurrency = (
  png: Buffer,
): { readonly handler: SidecarHandler; readonly peak: number } => {
  const tracker = {
    current: 0,
    peak: 0,
    handler: (_request, reply) => {
      tracker.current += 1;
      tracker.peak = Math.max(tracker.peak, tracker.current);
      setTimeout(() => {
        tracker.current -= 1;
        reply.writeHead(200, { "content-type": "image/png" });
        reply.end(png);
      }, 30);
    },
  } as { current: number; peak: number; handler: SidecarHandler };

  return tracker;
};

/** Polls an assertion until it holds, for the cases that own a real timer. */
const eventually = async (
  assertion: () => Promise<void>,
  timeoutMs = 5_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
};
