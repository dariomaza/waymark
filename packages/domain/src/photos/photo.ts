import type { PhotoId } from "../shared/identity.js";

/**
 * Background removal runs out of process and may never happen (ADR 4), so the
 * status is part of the photo rather than an assumption about it.
 */
export const PhotoProcessingStatus = {
  PENDING: "PENDING",
  DONE: "DONE",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;

export type PhotoProcessingStatus =
  (typeof PhotoProcessingStatus)[keyof typeof PhotoProcessingStatus];

/**
 * A stored image file and the state of its optional background removal.
 *
 * ADR 9: a photo has no ordering of its own. Whatever REFERENCES a photo owns
 * the order, and only one thing orders anything at all — `Item.photos`, whose
 * array index is the order and whose first element is the cover. A storage unit
 * points at a single `photoId` and has no order to express.
 */
export interface Photo {
  readonly id: PhotoId;
  /** Always written synchronously; the photo is usable from this alone. */
  readonly originalPath: string;
  /** Written only once background removal succeeded. */
  readonly processedPath: string | null;
  readonly processingStatus: PhotoProcessingStatus;
}

export interface CreatePhotoInput {
  readonly id: PhotoId;
  readonly originalPath: string;
}

export const createPhoto = (input: CreatePhotoInput): Photo => ({
  id: input.id,
  originalPath: input.originalPath,
  processedPath: null,
  processingStatus: PhotoProcessingStatus.PENDING,
});

export const markPhotoProcessed = (photo: Photo, processedPath: string): Photo => ({
  ...photo,
  processedPath,
  processingStatus: PhotoProcessingStatus.DONE,
});

export const markPhotoFailed = (photo: Photo): Photo => ({
  ...photo,
  processingStatus: PhotoProcessingStatus.FAILED,
});

export const markPhotoSkipped = (photo: Photo): Photo => ({
  ...photo,
  processingStatus: PhotoProcessingStatus.SKIPPED,
});

/** Reads always fall back to the original photo (ADR 4). */
export const displayPathOf = (photo: Photo): string =>
  photo.processedPath ?? photo.originalPath;
