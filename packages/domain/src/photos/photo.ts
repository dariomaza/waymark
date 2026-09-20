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

export interface Photo {
  readonly id: PhotoId;
  /** Always written synchronously; the photo is usable from this alone. */
  readonly originalPath: string;
  /** Written only once background removal succeeded. */
  readonly processedPath: string | null;
  readonly processingStatus: PhotoProcessingStatus;
  /** Order within the photos of an item; the first one is the cover. */
  readonly position: number;
}

export interface CreatePhotoInput {
  readonly id: PhotoId;
  readonly originalPath: string;
  readonly position?: number;
}

export const createPhoto = (input: CreatePhotoInput): Photo => ({
  id: input.id,
  originalPath: input.originalPath,
  processedPath: null,
  processingStatus: PhotoProcessingStatus.PENDING,
  position: input.position ?? 0,
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
