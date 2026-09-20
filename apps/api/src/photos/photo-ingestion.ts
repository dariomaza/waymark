import sharp, { type Metadata, type OutputInfo, type Sharp } from "sharp";

import { sniffImageFormat, type SupportedImageFormat } from "./image-format.js";
import { UnsupportedImageFormat } from "./photo-errors.js";

/**
 * # Turning an upload into two files
 *
 * Every photo that reaches disk has been decoded and re-encoded by this module
 * first. Nothing a client sends is ever written through untouched.
 *
 * ## Metadata is stripped, and it is not optional
 *
 * A phone photo carries EXIF, and EXIF carries GPS. This service is published
 * on the public internet through a Cloudflare Tunnel, and it serves the photos
 * back. Storing the coordinates of every box in the house — and handing them to
 * anyone who ever gets a session, or to a browser that caches them — is a
 * genuine privacy leak, not a tidiness issue. It also carries the camera make,
 * the serial number on some bodies, and the timestamp.
 *
 * Re-encoding is the reliable way to be rid of it. Libvips writes no metadata
 * into the output unless it is asked to, so the stripping is a consequence of
 * producing the file rather than a step that can be forgotten.
 *
 * ## Orientation is applied FIRST, and that order is the whole thing
 *
 * A phone held upright still records landscape pixels; an EXIF Orientation tag
 * is what tells a viewer to turn them. Strip the metadata first and the tag
 * goes with it, leaving the sideways pixels as the only truth — which is why
 * "every portrait photo is on its side" is the classic version of this bug.
 *
 * `autoOrient()` rotates the pixels according to the tag and drops the tag, in
 * that order, so what is written is upright and says nothing about rotation.
 *
 * ## Both files are written at upload
 *
 * A list screen shows two hundred items at once. Full-size images in that grid
 * over mobile data in a garage is not a slow screen, it is an unusable one. The
 * thumbnail is produced now, synchronously, because a thumbnail that arrives
 * later means a placeholder or the full image, and both are worse.
 */

/**
 * The longest edge a stored photo may have.
 *
 * A modern phone shoots 50 megapixels; nothing in this product can use them. At
 * 2048 the full-size view is sharp on any screen somebody is going to hold, and
 * a photo costs a few hundred kilobytes instead of a dozen megabytes on a
 * homelab disk that is also holding everything else.
 */
export const MAX_STORED_EDGE_PX = 2048;

/** Big enough to stay crisp on a phone's list row at 3x density. */
export const THUMBNAIL_EDGE_PX = 400;

/** Visually lossless for a photograph, at roughly half the bytes of q95. */
const STORED_QUALITY = 85;

/** A thumbnail is looked at for a second; it is allowed to be cheap. */
const THUMBNAIL_QUALITY = 75;

/**
 * Refused before decoding.
 *
 * A decompression bomb is a few kilobytes of file that declares a gigantic
 * canvas and expands to gigabytes of pixels on decode. The header is read
 * first, so an absurd declaration costs a header parse rather than the memory
 * it was asking for. 100 megapixels is well past any real camera and well
 * under anything dangerous.
 */
const MAX_DECODED_PIXELS = 100_000_000;

export interface IngestedPhoto {
  readonly format: SupportedImageFormat;
  /** Upright, stripped and capped. This is what gets served full size. */
  readonly original: Buffer;
  /** Always JPEG, always small. */
  readonly thumbnail: Buffer;
  /** Of the stored original, after rotation and capping. */
  readonly width: number;
  readonly height: number;
}

const reencode = (
  pipeline: Sharp,
  format: SupportedImageFormat,
  quality: number,
): Sharp => {
  switch (format) {
    case "jpeg":
      return pipeline.jpeg({ quality, mozjpeg: true });
    case "png":
      // Palette quantisation is what makes a screenshot of a receipt cheap;
      // photographs are not stored as PNG unless somebody sent one.
      return pipeline.png({ compressionLevel: 9, palette: true });
    case "webp":
      return pipeline.webp({ quality });
  }
};

export const ingestPhoto = async (bytes: Buffer): Promise<IngestedPhoto> => {
  // Cheap check first: the signature, from the bytes themselves, never from
  // the `Content-Type` the client declared.
  const format = sniffImageFormat(bytes);
  if (format === null) {
    throw new UnsupportedImageFormat(
      "its contents are not a JPEG, a PNG or a WebP",
    );
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch {
    throw new UnsupportedImageFormat("it could not be read as an image");
  }

  // The signature matched, so anything else here means the header lied or the
  // file is truncated. Refusing keeps a half-written photo out of the store.
  if (metadata.format !== format) {
    throw new UnsupportedImageFormat(
      `its signature says ${format} and its contents say ${metadata.format ?? "nothing"}`,
    );
  }

  const declaredPixels = (metadata.width ?? 0) * (metadata.height ?? 0);
  if (declaredPixels === 0) {
    throw new UnsupportedImageFormat("it declares no dimensions");
  }
  if (declaredPixels > MAX_DECODED_PIXELS) {
    throw new UnsupportedImageFormat(
      `it declares ${declaredPixels} pixels, which is more than this service will decode`,
    );
  }

  /**
   * One pipeline, reused for both outputs. `autoOrient` before `resize` so the
   * cap applies to the edges a person will actually see, not to the sensor's.
   */
  const upright = (): Sharp =>
    sharp(bytes, { failOn: "error" }).autoOrient();

  let original: Buffer;
  let info: OutputInfo;
  try {
    ({ data: original, info } = await reencode(
      upright().resize({
        width: MAX_STORED_EDGE_PX,
        height: MAX_STORED_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      }),
      format,
      STORED_QUALITY,
    ).toBuffer({ resolveWithObject: true }));
  } catch {
    throw new UnsupportedImageFormat("it could not be decoded");
  }

  const thumbnail = await upright()
    .resize({
      width: THUMBNAIL_EDGE_PX,
      height: THUMBNAIL_EDGE_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    // Always JPEG. A thumbnail never needs transparency, and one format means
    // the list screen has exactly one thing to decode.
    .jpeg({ quality: THUMBNAIL_QUALITY, mozjpeg: true })
    .toBuffer();

  return { format, original, thumbnail, width: info.width, height: info.height };
};
