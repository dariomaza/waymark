import {
  createPhoto,
  markPhotoFailed,
  markPhotoProcessed,
  markPhotoSkipped,
  photoId,
  PhotoProcessingStatus,
  type Photo,
  type PhotoId,
} from "@ariadna/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaPhotoRepository } from "../persistence/prisma-photo-repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../persistence/testing/test-database.js";
import { PrismaPhotoProcessingQueue } from "./photo-processing-queue.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");
const LEASE_MS = 60_000;
const later = (ms: number): Date => new Date(NOW.getTime() + ms);

describe("PrismaPhotoProcessingQueue", () => {
  let database: TestDatabase;
  let photos: PrismaPhotoRepository;
  let queue: PrismaPhotoProcessingQueue;

  beforeAll(async () => {
    database = await createTestDatabase();
    photos = new PrismaPhotoRepository(database.client);
    queue = new PrismaPhotoProcessingQueue(database.client);
  });

  afterAll(async () => {
    await database.destroy();
  });

  beforeEach(async () => {
    await database.reset();
  });

  const aPhoto = async (id: string): Promise<Photo> => {
    const photo = createPhoto({
      id: photoId(id),
      originalPath: `ab/${id}.jpg`,
      thumbnailPath: `ab/${id}.thumb.jpg`,
    });
    await photos.save(photo);

    return photo;
  };

  const claim = async (limit = 10, now = NOW): Promise<readonly PhotoId[]> =>
    (await queue.claim({ now, limit, leaseMs: LEASE_MS })).map(
      (claimed) => claimed.photoId,
    );

  describe("what is claimable", () => {
    it("hands out a photo nobody has tried yet, as attempt one", async () => {
      await aPhoto("photo-1");

      const claimed = await queue.claim({ now: NOW, limit: 10, leaseMs: LEASE_MS });

      expect(claimed).toEqual([{ photoId: photoId("photo-1"), attempt: 1 }]);
    });

    it.each([
      ["DONE", (photo: Photo): Photo => markPhotoProcessed(photo, "ab/p.processed.jpg")],
      ["FAILED", markPhotoFailed],
      ["SKIPPED", markPhotoSkipped],
    ])("never hands out a %s photo", async (_status, mark) => {
      await photos.save(mark(await aPhoto("photo-1")));

      expect(await claim()).toEqual([]);
    });

    /**
     * Oldest first. A backlog that hands out the newest photo first leaves the
     * one that has already been waiting longest waiting for ever.
     */
    it("hands out the photo that has been waiting longest", async () => {
      await aPhoto("photo-old");
      await aPhoto("photo-new");

      expect(await claim(1)).toEqual([photoId("photo-old")]);
    });

    it("hands out no more than it was asked for", async () => {
      await aPhoto("photo-1");
      await aPhoto("photo-2");
      await aPhoto("photo-3");

      expect(await claim(2)).toHaveLength(2);
    });
  });

  describe("the lease", () => {
    /**
     * The property that makes a second worker — or the same one, woken twice
     * by two uploads — safe: a claimed photo is invisible to everybody else
     * until its lease runs out.
     */
    it("hides a claimed photo from the next claim", async () => {
      await aPhoto("photo-1");

      await claim();

      expect(await claim()).toEqual([]);
    });

    it("never hands the same photo to two claims racing each other", async () => {
      await aPhoto("photo-1");

      const [first, second] = await Promise.all([claim(), claim()]);

      expect([...first, ...second]).toEqual([photoId("photo-1")]);
    });

    /**
     * A worker that died holding a photo must not take it to the grave. The
     * lease expires, somebody else picks the photo up, and the attempt the dead
     * process already spent is still counted — which is what stops a crash loop
     * from retrying for ever.
     */
    it("hands the photo back once the lease has expired, counting the attempt", async () => {
      await aPhoto("photo-1");
      await claim();

      const reclaimed = await queue.claim({
        now: later(LEASE_MS + 1),
        limit: 10,
        leaseMs: LEASE_MS,
      });

      expect(reclaimed).toEqual([{ photoId: photoId("photo-1"), attempt: 2 }]);
    });
  });

  describe("backoff", () => {
    it("hides a photo until its next attempt is due", async () => {
      await aPhoto("photo-1");
      await claim();
      await queue.retryLater({
        photoId: photoId("photo-1"),
        at: later(300_000),
        reason: "the sidecar could not be reached",
        now: NOW,
      });

      expect(await claim(10, later(299_999))).toEqual([]);
    });

    it("hands it back once that moment passes", async () => {
      await aPhoto("photo-1");
      await claim();
      await queue.retryLater({
        photoId: photoId("photo-1"),
        at: later(300_000),
        reason: "the sidecar could not be reached",
        now: NOW,
      });

      const claimed = await queue.claim({
        now: later(300_001),
        limit: 10,
        leaseMs: LEASE_MS,
      });

      expect(claimed).toEqual([{ photoId: photoId("photo-1"), attempt: 2 }]);
    });

    it("releases the lease it was holding", async () => {
      await aPhoto("photo-1");
      await claim();
      await queue.retryLater({
        photoId: photoId("photo-1"),
        at: NOW,
        reason: "timed out",
        now: NOW,
      });

      expect(await claim()).toEqual([photoId("photo-1")]);
    });
  });

  describe("giving up", () => {
    /**
     * The photo row decides that a photo was abandoned; this table only
     * explains it. Asking the other way round would let the bookkeeping claim
     * a photo is failed while the column everything else reads says otherwise.
     */
    it("keeps the reason a photo was abandoned, and how many attempts it took", async () => {
      const photo = await aPhoto("photo-1");
      await claim();
      await photos.save(markPhotoFailed(photo));
      await queue.abandon({
        photoId: photoId("photo-1"),
        reason: "the sidecar refused this image with 415",
        now: later(1_000),
      });

      expect(await queue.abandoned(10)).toEqual([
        {
          photoId: photoId("photo-1"),
          attempts: 1,
          lastError: "the sidecar refused this image with 415",
          lastAttemptAt: later(1_000),
        },
      ]);
    });

    it("lists the failed photos, so a person can ask for all of them again", async () => {
      await photos.save(markPhotoFailed(await aPhoto("photo-1")));
      await photos.save(markPhotoProcessed(await aPhoto("photo-2"), "ab/x.jpg"));

      expect(await queue.failedPhotoIds(10)).toEqual([photoId("photo-1")]);
    });
  });

  describe("forgetting", () => {
    it("puts a photo back at attempt one", async () => {
      await aPhoto("photo-1");
      await claim();

      await queue.forget(photoId("photo-1"));

      expect(await queue.claim({ now: NOW, limit: 10, leaseMs: LEASE_MS })).toEqual([
        { photoId: photoId("photo-1"), attempt: 1 },
      ]);
    });

    it("is a no-op for a photo that was never attempted", async () => {
      await expect(queue.forget(photoId("nobody"))).resolves.toBeUndefined();
    });
  });

  describe("sweeping", () => {
    /**
     * The photo and its bookkeeping are two writes, so a crash can land between
     * them. The next claim is what reconciles it: bookkeeping for a photo that
     * is no longer waiting — or no longer exists — is removed, while an
     * abandoned photo keeps its record, because that record is the only place
     * the reason survives.
     */
    it("drops bookkeeping for a photo that finished", async () => {
      const photo = await aPhoto("photo-1");
      await claim();
      await photos.save(markPhotoProcessed(photo, "ab/photo-1.processed.jpg"));

      await claim();

      expect(await attemptRowCount(database)).toBe(0);
    });

    it("drops bookkeeping for a photo that no longer exists", async () => {
      await aPhoto("photo-1");
      await claim();
      await photos.deleteMany([photoId("photo-1")]);

      await claim();

      expect(await attemptRowCount(database)).toBe(0);
    });

    it("keeps the record of an abandoned photo", async () => {
      const photo = await aPhoto("photo-1");
      await claim();
      await queue.abandon({ photoId: photo.id, reason: "gave up", now: NOW });
      await photos.save(markPhotoFailed(photo));

      await claim();

      expect(await queue.abandoned(10)).toHaveLength(1);
    });
  });

  describe("counting what is where", () => {
    it("answers zero for everything when there are no photos", async () => {
      expect(await queue.counts()).toEqual({
        PENDING: 0,
        DONE: 0,
        FAILED: 0,
        SKIPPED: 0,
      });
    });

    it("counts photos by processing status", async () => {
      await aPhoto("photo-1");
      await aPhoto("photo-2");
      await photos.save(markPhotoProcessed(await aPhoto("photo-3"), "ab/x.jpg"));
      await photos.save(markPhotoFailed(await aPhoto("photo-4")));
      await photos.save(markPhotoSkipped(await aPhoto("photo-5")));

      expect(await queue.counts()).toEqual({
        [PhotoProcessingStatus.PENDING]: 2,
        [PhotoProcessingStatus.DONE]: 1,
        [PhotoProcessingStatus.FAILED]: 1,
        [PhotoProcessingStatus.SKIPPED]: 1,
      });
    });
  });
});

const attemptRowCount = async (database: TestDatabase): Promise<number> =>
  database.client.photoProcessingAttempt.count();
