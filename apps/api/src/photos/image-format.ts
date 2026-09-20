/**
 * # What an upload is allowed to be, decided by the bytes
 *
 * The declared `Content-Type` of a multipart part is a string the client picked,
 * about bytes the same client picked. It is evidence of nothing. This service is
 * published on the internet through a Cloudflare Tunnel, and it writes whatever
 * it accepts to a directory it later serves back: believing the header means a
 * PHP file, an HTML document with a script in it, or a zip full of anything ends
 * up on disk and comes back out under an `image/*` header.
 *
 * So the format is decided by sniffing the signature, and the answer is either
 * one of three formats this service explicitly supports or a refusal. Not "an
 * image" — a KNOWN image.
 *
 * ## Why these three, and not the rest
 *
 * - **JPEG** is what every phone camera produces.
 * - **PNG** is what every screenshot is, and screenshots of a serial number or
 *   a receipt are a real thing people photograph a box for.
 * - **WebP** is what a modern Android share sheet increasingly hands over.
 *
 * Everything else is refused on purpose rather than by oversight:
 *
 * - **SVG** is a DOCUMENT. It can carry script and fetch external references,
 *   and a browser handed one from this origin will run it. It happens to be an
 *   image; that is not enough.
 * - **GIF, TIFF, AVIF, HEIC** are all decodable by the library in use, which is
 *   exactly the problem: every additional decoder is attack surface reachable
 *   by an unauthenticated-adjacent path, in exchange for a format nobody in a
 *   garage is going to upload. HEIC additionally carries patent-encumbered
 *   baggage most distributions build libvips without, so it would work on a
 *   laptop and fail in the container.
 */

export const SUPPORTED_IMAGE_FORMATS = ["jpeg", "png", "webp"] as const;

export type SupportedImageFormat = (typeof SUPPORTED_IMAGE_FORMATS)[number];

interface Signature {
  readonly format: SupportedImageFormat;
  readonly offset: number;
  readonly magic: readonly number[];
  /** A second run of bytes that must also match, for container formats. */
  readonly also?: { readonly offset: number; readonly magic: readonly number[] };
}

const ascii = (text: string): readonly number[] => [...text].map((c) => c.charCodeAt(0));

const SIGNATURES: readonly Signature[] = [
  // SOI marker, then the first segment marker. Every JPEG starts FF D8 FF.
  { format: "jpeg", offset: 0, magic: [0xff, 0xd8, 0xff] },
  // The eight byte PNG signature, including the CRLF/LF pair that detects a
  // file mangled by a text mode transfer.
  {
    format: "png",
    offset: 0,
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  // A RIFF container. `RIFF` alone is also WAV and AVI, so the `WEBP` fourcc
  // at offset 8 is what actually decides it.
  {
    format: "webp",
    offset: 0,
    magic: ascii("RIFF"),
    also: { offset: 8, magic: ascii("WEBP") },
  },
];

const matches = (
  bytes: Buffer,
  offset: number,
  magic: readonly number[],
): boolean => {
  if (bytes.length < offset + magic.length) {
    return false;
  }

  return magic.every((byte, index) => bytes[offset + index] === byte);
};

/**
 * The format these bytes actually are, or `null` for anything this service does
 * not explicitly support.
 *
 * A signature match is necessary and not sufficient: the ingestion step decodes
 * the image afterwards, so a file with a correct header and garbage behind it
 * is still refused. This is the cheap check that runs first.
 */
export const sniffImageFormat = (bytes: Buffer): SupportedImageFormat | null =>
  SIGNATURES.find(
    (signature) =>
      matches(bytes, signature.offset, signature.magic) &&
      (signature.also === undefined ||
        matches(bytes, signature.also.offset, signature.also.magic)),
  )?.format ?? null;

const CONTENT_TYPES: Readonly<Record<SupportedImageFormat, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Extensions are part of the stored path, so they are fixed here rather than
 * derived from the format name: `jpeg` would otherwise produce `.jpeg` files
 * next to the `.jpg` everybody expects.
 */
const EXTENSIONS: Readonly<Record<SupportedImageFormat, string>> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

export const contentTypeOf = (format: SupportedImageFormat): string =>
  CONTENT_TYPES[format];

export const extensionOf = (format: SupportedImageFormat): string =>
  EXTENSIONS[format];

/** The reverse, for serving a stored file whose extension is all that is left. */
export const formatOfExtension = (
  extension: string,
): SupportedImageFormat | null =>
  SUPPORTED_IMAGE_FORMATS.find((format) => EXTENSIONS[format] === extension) ?? null;
