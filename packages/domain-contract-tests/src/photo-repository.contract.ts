import {
  createPhoto,
  markPhotoFailed,
  markPhotoProcessed,
  PhotoProcessingStatus,
  photoId,
  type Photo,
} from "@ariadna/domain";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { aPhotoId } from "./builders.js";
import type { PhotoRepositoryContext, RepositoryHarness } from "./harness.js";

const aPhoto = (id: string): Photo =>
  createPhoto({
    id: photoId(id),
    originalPath: `ab/${id}.jpg`,
    thumbnailPath: `ab/${id}.thumb.jpg`,
  });

/**
 * The contract every `PhotoRepository` must satisfy.
 *
 * A photo is the one aggregate whose rows and whose FILES are managed by
 * different layers (ADR 4, ADR 9), so the repository has to be boringly honest
 * about the rows: what goes in comes out, what is deleted is gone, and a
 * delete of something that was never there is not an error — because releasing
 * files is retried, and a retry must not fail on the second attempt.
 */
export const photoRepositoryContract = (
  harness: RepositoryHarness<PhotoRepositoryContext>,
): void => {
  describe(`PhotoRepository contract: ${harness.name}`, () => {
    let photos: PhotoRepositoryContext["photos"];

    beforeEach(async () => {
      ({ photos } = await harness.setUp());
    });

    afterAll(async () => {
      await harness.tearDown();
    });

    it("round-trips a freshly created photo", async () => {
      const photo = aPhoto("photo-1");

      await photos.save(photo);

      expect(await photos.findById(photo.id)).toEqual(photo);
    });

    it("stores both file paths, because both are written at upload", async () => {
      await photos.save(aPhoto("photo-1"));

      const found = await photos.findById(photoId("photo-1"));

      expect(found?.originalPath).toBe("ab/photo-1.jpg");
      expect(found?.thumbnailPath).toBe("ab/photo-1.thumb.jpg");
    });

    it("starts pending with no processed path (ADR 4)", async () => {
      await photos.save(aPhoto("photo-1"));

      const found = await photos.findById(photoId("photo-1"));

      expect(found?.processingStatus).toBe(PhotoProcessingStatus.PENDING);
      expect(found?.processedPath).toBeNull();
    });

    it("round-trips every processing state", async () => {
      const done = markPhotoProcessed(aPhoto("done"), "ab/done.png");
      const failed = markPhotoFailed(aPhoto("failed"));

      await photos.save(done);
      await photos.save(failed);

      expect(await photos.findById(done.id)).toEqual(done);
      expect(await photos.findById(failed.id)).toEqual(failed);
    });

    it("answers null for a photo that was never stored", async () => {
      expect(await photos.findById(aPhotoId("never"))).toBeNull();
    });

    it("overwrites rather than duplicating on a second save", async () => {
      await photos.save(aPhoto("photo-1"));

      await photos.save(markPhotoProcessed(aPhoto("photo-1"), "ab/photo-1.png"));

      const found = await photos.findById(photoId("photo-1"));
      expect(found?.processingStatus).toBe(PhotoProcessingStatus.DONE);
      expect(found?.processedPath).toBe("ab/photo-1.png");
    });

    describe("findManyByIds", () => {
      it("answers in the order it was asked", async () => {
        await photos.save(aPhoto("a"));
        await photos.save(aPhoto("b"));
        await photos.save(aPhoto("c"));

        const found = await photos.findManyByIds([
          photoId("c"),
          photoId("a"),
          photoId("b"),
        ]);

        expect(found.map((photo) => photo.id)).toEqual(["c", "a", "b"]);
      });

      it("simply omits ids that match nothing", async () => {
        await photos.save(aPhoto("a"));

        const found = await photos.findManyByIds([photoId("a"), photoId("ghost")]);

        expect(found.map((photo) => photo.id)).toEqual(["a"]);
      });

      it("answers an empty list for an empty request", async () => {
        expect(await photos.findManyByIds([])).toEqual([]);
      });
    });

    describe("deleteMany", () => {
      it("forgets the rows it is given and keeps the rest", async () => {
        await photos.save(aPhoto("a"));
        await photos.save(aPhoto("b"));

        await photos.deleteMany([photoId("a")]);

        expect(await photos.findById(photoId("a"))).toBeNull();
        expect(await photos.findById(photoId("b"))).not.toBeNull();
      });

      /**
       * Releasing files is retried, and a release that already happened must
       * not turn the retry into a failure. A delete of nothing is a no-op.
       */
      it("is a no-op for ids that were never stored", async () => {
        await expect(photos.deleteMany([photoId("ghost")])).resolves.toBeUndefined();
      });

      it("accepts an empty list", async () => {
        await expect(photos.deleteMany([])).resolves.toBeUndefined();
      });
    });
  });
};
