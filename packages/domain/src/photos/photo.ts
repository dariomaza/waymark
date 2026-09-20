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
  /**
   * A small version of the same image, always written at the same time as the
   * original.
   *
   * It is STORED rather than derived from the original's path because the
   * layout the files sit in is an adapter decision, and adapters change. A row
   * written under one layout keeps pointing at the file it was actually
   * written to, instead of at wherever today's rule says it should be.
   */
  readonly thumbnailPath: string;
  /** Written only once background removal succeeded. */
  readonly processedPath: string | null;
  readonly processingStatus: PhotoProcessingStatus;
}

export interface CreatePhotoInput {
  readonly id: PhotoId;
  readonly originalPath: string;
  readonly thumbnailPath: string;
}

export const createPhoto = (input: CreatePhotoInput): Photo => ({
  id: input.id,
  originalPath: input.originalPath,
  thumbnailPath: input.thumbnailPath,
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

/**
 * Puts a photo back in the queue, from wherever it ended up.
 *
 * ADR 4 notes that `FAILED` photos would otherwise stay unprocessed for ever,
 * so something has to be able to ask again once the cause is fixed. That ask is
 * a transition on the photo rather than a flag beside it: "waiting to be
 * processed" is already spelled `PENDING`, and a second way to say it is how
 * two of them get to disagree.
 *
 * The previous result goes with it. A `PENDING` photo still pointing at a
 * processed file is exactly the combination `displayPathOf` cannot read
 * correctly, and it is the one the status exists to rule out.
 */
export const markPhotoPending = (photo: Photo): Photo => ({
  ...photo,
  processedPath: null,
  processingStatus: PhotoProcessingStatus.PENDING,
});

/** Reads always fall back to the original photo (ADR 4). */
export const displayPathOf = (photo: Photo): string =>
  photo.processedPath ?? photo.originalPath;
