import { describe, expect, it } from "vitest";

import { photoId } from "../shared/identity.js";
import {
  createPhoto,
  displayPathOf,
  markPhotoFailed,
  markPhotoProcessed,
  markPhotoSkipped,
  PhotoProcessingStatus,
} from "./photo.js";

const baseInput = {
  id: photoId("photo-1"),
  originalPath: "uploads/photo-1.jpg",
};

describe("Photo", () => {
  it("is pending processing when created", () => {
    const photo = createPhoto(baseInput);

    expect(photo.processingStatus).toBe(PhotoProcessingStatus.PENDING);
    expect(photo.processedPath).toBeNull();
  });

  it("keeps the original path it was given", () => {
    expect(createPhoto(baseInput).originalPath).toBe("uploads/photo-1.jpg");
  });

  it("takes the first position when none is given", () => {
    expect(createPhoto(baseInput).position).toBe(0);
  });

  it("keeps the position it was given", () => {
    expect(createPhoto({ ...baseInput, position: 3 }).position).toBe(3);
  });

  it("falls back to the original path while it is not processed", () => {
    expect(displayPathOf(createPhoto(baseInput))).toBe("uploads/photo-1.jpg");
  });

  it("shows the processed path once processing is done", () => {
    const photo = markPhotoProcessed(
      createPhoto(baseInput),
      "uploads/photo-1.png",
    );

    expect(photo.processingStatus).toBe(PhotoProcessingStatus.DONE);
    expect(displayPathOf(photo)).toBe("uploads/photo-1.png");
  });

  it("still shows the original path when processing failed", () => {
    const photo = markPhotoFailed(createPhoto(baseInput));

    expect(photo.processingStatus).toBe(PhotoProcessingStatus.FAILED);
    expect(photo.processedPath).toBeNull();
    expect(displayPathOf(photo)).toBe("uploads/photo-1.jpg");
  });

  it("still shows the original path when processing was skipped", () => {
    const photo = markPhotoSkipped(createPhoto(baseInput));

    expect(photo.processingStatus).toBe(PhotoProcessingStatus.SKIPPED);
    expect(displayPathOf(photo)).toBe("uploads/photo-1.jpg");
  });

  it("can be retried after a failure", () => {
    const failed = markPhotoFailed(createPhoto(baseInput));

    const retried = markPhotoProcessed(failed, "uploads/photo-1.png");

    expect(retried.processingStatus).toBe(PhotoProcessingStatus.DONE);
    expect(retried.processedPath).toBe("uploads/photo-1.png");
  });

  it("does not mutate the photo it transitions from", () => {
    const photo = createPhoto(baseInput);

    markPhotoProcessed(photo, "uploads/photo-1.png");

    expect(photo.processingStatus).toBe(PhotoProcessingStatus.PENDING);
    expect(photo.processedPath).toBeNull();
  });
});
