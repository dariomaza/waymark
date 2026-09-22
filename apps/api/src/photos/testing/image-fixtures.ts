import { randomBytes } from "node:crypto";
import { crc32 } from "node:zlib";

import sharp, { type Sharp } from "sharp";

/**
 * Real image fixtures, built with the same library that later reads them.
 *
 * Nothing here is a mock. A checked-in binary would rot and nobody could tell
 * what was inside it; building the bytes in the test makes the interesting
 * property — "this file carries GPS coordinates", "this file says rotate me" —
 * visible in the code that depends on it.
 */

export interface GpsCoordinates {
  readonly latitudeRef: string;
  readonly latitude: string;
  readonly longitudeRef: string;
  readonly longitude: string;
}

/** Somewhere in central London, in the rational form EXIF stores. */
export const A_HOUSE: GpsCoordinates = {
  latitudeRef: "N",
  latitude: "51/1 30/1 3230/100",
  longitudeRef: "W",
  longitude: "0/1 7/1 4366/100",
};

const solidImage = (width: number, height: number): Sharp =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  });

/**
 * A landscape JPEG carrying GPS coordinates and a camera make, exactly as a
 * phone hands it over.
 */
export const aPhotoWithGps = async (
  width = 120,
  height = 60,
  gps: GpsCoordinates = A_HOUSE,
): Promise<Buffer> =>
  solidImage(width, height)
    .withExif({
      IFD0: { Make: "Waymark", Model: "Test Phone" },
      IFD3: {
        GPSLatitudeRef: gps.latitudeRef,
        GPSLatitude: gps.latitude,
        GPSLongitudeRef: gps.longitudeRef,
        GPSLongitude: gps.longitude,
      },
    })
    .jpeg()
    .toBuffer();

/**
 * A photo whose PIXELS are landscape and whose EXIF says "orientation 6",
 * meaning a viewer must rotate it 90° clockwise to show it upright.
 *
 * This is what a phone held vertically actually produces: the sensor is
 * landscape, and only the tag says otherwise. Re-encoding without applying the
 * tag is exactly how every photo taken in portrait ends up sideways.
 */
export const aPortraitPhotoNeedingRotation = async (
  sensorWidth = 120,
  sensorHeight = 60,
): Promise<Buffer> => {
  const withGps = await aPhotoWithGps(sensorWidth, sensorHeight);

  return sharp(withGps).withMetadata({ orientation: 6 }).jpeg().toBuffer();
};

/** A plain image in a given format, with no metadata worth mentioning. */
export const aPlainImage = async (
  format: "jpeg" | "png" | "webp",
  width = 64,
  height = 48,
): Promise<Buffer> => solidImage(width, height).toFormat(format).toBuffer();

/**
 * A real JPEG guaranteed to be larger than `minBytes` on the wire.
 *
 * It has to be NOISE. A flat colour at 4000x4000 compresses to a couple of
 * kilobytes, so "a big image" and "a big file" are not the same thing, and a
 * size-limit test built on the first one tests nothing at all. Random pixels
 * are incompressible, which is exactly the property wanted here.
 */
export const aPhotoLargerThan = async (minBytes: number): Promise<Buffer> => {
  let edge = 256;

  for (;;) {
    const noise = await sharp(randomBytes(edge * edge * 3), {
      raw: { width: edge, height: edge, channels: 3 },
    })
      .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
      .toBuffer();

    if (noise.byteLength > minBytes) {
      return noise;
    }

    edge *= 2;
  }
};

/** An image far bigger than the ingestion cap, to prove downscaling happens. */
export const aHugePhoto = async (width: number, height: number): Promise<Buffer> =>
  solidImage(width, height).jpeg({ quality: 60 }).toBuffer();

/**
 * What `rembg` hands back: a CUTOUT, as a PNG with an alpha channel.
 *
 * The left half is opaque red — the subject — and the right half is fully
 * transparent, which is what the background became. It is deliberately not a
 * white image: transparency and white are exactly the two things that must not
 * be confused, because a viewer renders "transparent" as whatever is behind it,
 * which on a dark themed phone is black.
 */
export const aCutout = async (width = 64, height = 32): Promise<Buffer> => {
  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const opaque = x < width / 2;
      pixels[at] = opaque ? 255 : 0;
      pixels[at + 1] = 0;
      pixels[at + 2] = 0;
      pixels[at + 3] = opaque ? 255 : 0;
    }
  }

  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
};

/** Bytes that are not an image at all, whatever anybody claims they are. */
export const notAnImage = (): Buffer =>
  Buffer.from("<?php system($_GET['cmd']); ?>", "utf8");

/**
 * A decompression bomb: a tiny PNG whose header CLAIMS an enormous canvas.
 *
 * This is the shape the attack actually takes. Nobody uploads a real
 * 12000x12000 image; they upload a few hundred bytes that a decoder will
 * happily expand into hundreds of megabytes of pixels. Building it by rewriting
 * the IHDR of a real PNG — and fixing the chunk CRC, or every reader rejects it
 * for the wrong reason — is the only way to produce one without allocating the
 * memory the test is about.
 */
export const aPngDeclaringHugeDimensions = async (
  width: number,
  height: number,
): Promise<Buffer> => {
  const png = await solidImage(1, 1).png().toBuffer();

  // 8 byte signature, then the IHDR chunk: 4 length, 4 type, 4 width,
  // 4 height, 5 more fields, 4 CRC. The CRC covers the type and the data.
  const IHDR_TYPE_AT = 12;
  const IHDR_DATA_AT = 16;
  const IHDR_DATA_LENGTH = 13;

  const patched = Buffer.from(png);
  patched.writeUInt32BE(width, IHDR_DATA_AT);
  patched.writeUInt32BE(height, IHDR_DATA_AT + 4);
  patched.writeUInt32BE(
    crc32(patched.subarray(IHDR_TYPE_AT, IHDR_DATA_AT + IHDR_DATA_LENGTH)),
    IHDR_DATA_AT + IHDR_DATA_LENGTH,
  );

  return patched;
};
