import { describe, expect, it } from "vitest";

import { photoId } from "../shared/identity.js";
import {
  createPhoto,
  displayPathOf,
  markPhotoFailed,
  markPhotoPending,
  markPhotoProcessed,
  markPhotoSkipped,
  PhotoProcessingStatus,
} from "./photo.js";

const baseInput = {
  id: photoId("photo-1"),
  originalPath: "3f/photo-1.jpg",
  thumbnailPath: "3f/photo-1.thumb.jpg",
};

describe("Photo", () => {
  it("is pending processing when created", () => {
    const photo = createPhoto(baseInput);

    expect(photo.processingStatus).toBe(PhotoProcessingStatus.PENDING);
    expect(photo.processedPath).toBeNull();
  });

  it("keeps the original path it was given", () => {
    expect(createPhoto(baseInput).originalPath).toBe("3f/photo-1.jpg");
  });

  it("has a thumbnail from the moment it exists", () => {
    // A list screen is the first thing anybody opens. A photo whose thumbnail
    // arrives later would mean either a placeholder or the full image over
    // mobile data, and both are worse than writing two files at once.
    expect(createPhoto(baseInput).thumbnailPath).toBe("3f/photo-1.thumb.jpg");
  });

  /**
   * ADR 9: a photo carries no ordering of its own. Order belongs to whatever
   * references the photo, and only `Item.photos` orders anything at all.
   */
  it("carries no position of its own", () => {
    expect(createPhoto(baseInput)).not.toHaveProperty("position");
  });

  it("falls back to the original path while it is not processed", () => {
    expect(displayPathOf(createPhoto(baseInput))).toBe("3f/photo-1.jpg");
  });

  it("shows the processed path once processing is done", () => {
    const photo = markPhotoProcessed(
      createPhoto(baseInput),
      "3f/photo-1.png",
    );

    expect(photo.processingStatus).toBe(PhotoProcessingStatus.DONE);
    expect(displayPathOf(photo)).toBe("3f/photo-1.png");
  });

  it("still shows the original path when processing failed", () => {
    const photo = markPhotoFailed(createPhoto(baseInput));

    expect(photo.processingStatus).toBe(PhotoProcessingStatus.FAILED);
    expect(photo.processedPath).toBeNull();
    expect(displayPathOf(photo)).toBe("3f/photo-1.jpg");
  });

  it("still shows the original path when processing was skipped", () => {
    const photo = markPhotoSkipped(createPhoto(baseInput));

    expect(photo.processingStatus).toBe(PhotoProcessingStatus.SKIPPED);
    expect(displayPathOf(photo)).toBe("3f/photo-1.jpg");
  });

  it("can be retried after a failure", () => {
    const failed = markPhotoFailed(createPhoto(baseInput));

    const retried = markPhotoProcessed(failed, "3f/photo-1.png");

    expect(retried.processingStatus).toBe(PhotoProcessingStatus.DONE);
    expect(retried.processedPath).toBe("3f/photo-1.png");
  });

  describe("being put back in the queue", () => {
    /**
     * ADR 4 leaves `FAILED` photos unprocessed for ever unless something can
     * ask for them again. That ask is a transition on the photo, not a flag
     * somewhere else: a photo waiting to be processed is spelled `PENDING`, and
     * a second way to say the same thing is how two of them get to disagree.
     */
    it("returns a failed photo to PENDING", () => {
      const photo = markPhotoPending(markPhotoFailed(createPhoto(baseInput)));

      expect(photo.processingStatus).toBe(PhotoProcessingStatus.PENDING);
    });

    it("works for a skipped photo too, since a sidecar can change its mind", () => {
      const photo = markPhotoPending(markPhotoSkipped(createPhoto(baseInput)));

      expect(photo.processingStatus).toBe(PhotoProcessingStatus.PENDING);
    });

    /**
     * The processed path goes with it. A photo that is waiting to be processed
     * while still pointing at the result of a previous run would be a `PENDING`
     * row that `displayPathOf` reads as done — the one combination the status
     * exists to rule out.
     */
    it("forgets the result of the previous run", () => {
      const done = markPhotoProcessed(createPhoto(baseInput), "3f/photo-1.png");

      const photo = markPhotoPending(done);

      expect(photo.processedPath).toBeNull();
      expect(displayPathOf(photo)).toBe("3f/photo-1.jpg");
    });

    it("keeps the files the photo is made of", () => {
      const photo = markPhotoPending(markPhotoFailed(createPhoto(baseInput)));

      expect(photo.originalPath).toBe("3f/photo-1.jpg");
      expect(photo.thumbnailPath).toBe("3f/photo-1.thumb.jpg");
    });

    it("does not mutate the photo it transitions from", () => {
      const done = markPhotoProcessed(createPhoto(baseInput), "3f/photo-1.png");

      markPhotoPending(done);

      expect(done.processingStatus).toBe(PhotoProcessingStatus.DONE);
      expect(done.processedPath).toBe("3f/photo-1.png");
    });
  });

  it("does not mutate the photo it transitions from", () => {
    const photo = createPhoto(baseInput);

    markPhotoProcessed(photo, "3f/photo-1.png");

    expect(photo.processingStatus).toBe(PhotoProcessingStatus.PENDING);
    expect(photo.processedPath).toBeNull();
  });
});
