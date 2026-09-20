import { HttpError } from "../http/http-error.js";

/**
 * Photo refusals are `HttpError`s, not `DomainError`s, on purpose.
 *
 * "These bytes are not a JPEG" and "this file is 40 MB" are statements about a
 * TRANSPORT, not about the inventory. The domain has no notion of bytes, a
 * content type or an upload at all — a photo reaches it already written, as a
 * path and a processing state — so inventing domain errors for them would push
 * HTTP concerns into `packages/domain` and earn an entry in a table (ADR 8)
 * that describes rules about boxes.
 *
 * The cap on how many photos an ITEM may hold is the opposite case and lives in
 * the domain as `TooManyItemPhotos`, because that is a rule about an item.
 */

export class UnsupportedImageFormat extends HttpError {
  constructor(reason: string) {
    super(
      415,
      "UNSUPPORTED_IMAGE_FORMAT",
      `The uploaded file is not a supported image: ${reason}`,
      { supported: ["image/jpeg", "image/png", "image/webp"] },
    );
  }
}

export class PhotoTooLarge extends HttpError {
  constructor(readonly maxBytes: number) {
    super(
      413,
      "PHOTO_TOO_LARGE",
      `The uploaded file is larger than the ${maxBytes} byte limit`,
      { maxBytes },
    );
  }
}

export class MissingPhotoUpload extends HttpError {
  constructor() {
    super(
      400,
      "MISSING_PHOTO_UPLOAD",
      'The request must be multipart/form-data with one file part named "file"',
    );
  }
}

/**
 * A photo row exists but its file does not, or the other way round. This is a
 * 404 rather than a 500 because the honest answer to "give me this image" is
 * that it is not there, and the one thing the release path is allowed to leave
 * behind (see `PhotoRelease`) is a file with no row.
 */
export class PhotoNotFound extends HttpError {
  constructor(readonly photoId: string) {
    super(404, "PHOTO_NOT_FOUND", `Photo ${photoId} was not found`, { photoId });
  }
}
