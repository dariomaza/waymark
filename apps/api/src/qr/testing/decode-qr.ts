import * as jsqr from "jsqr";
import sharp from "sharp";

type QrDecoder = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => { readonly data: string } | null;

/**
 * `jsqr` 1.4 is a CommonJS UMD bundle whose declaration file is written with
 * ESM syntax. Under `module: NodeNext`, TypeScript hands back a synthetic
 * namespace whose `default` is the namespace again, so neither a default import
 * nor `jsqr.default` is callable at the type level even though it is a function
 * at runtime. One narrow, documented assertion in a test helper beats loosening
 * the compiler options for the whole package.
 */
const jsQR = (jsqr as unknown as { readonly default: QrDecoder }).default;

/**
 * Decodes a QR symbol back to the text it carries.
 *
 * The tests decode rather than compare bytes on purpose. A snapshot of a PNG
 * proves the encoder is deterministic, which nobody doubted; it says nothing
 * about whether a phone pointed at the printed label ends up on the right page.
 * Round-tripping through a real decoder is the only assertion that does.
 */
const decodePixels = (
  data: Buffer,
  width: number,
  height: number,
): string | null =>
  jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height)
    ?.data ?? null;

export const decodeQrPng = async (png: Buffer): Promise<string | null> => {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return decodePixels(data, info.width, info.height);
};

/**
 * An SVG has no pixels, so it is rasterised first — which also proves the
 * markup is something a renderer can actually draw, not merely well formed.
 */
export const decodeQrSvg = async (svg: string): Promise<string | null> => {
  const { data, info } = await sharp(Buffer.from(svg, "utf8"), { density: 300 })
    .resize(600, 600, { fit: "fill", kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return decodePixels(data, info.width, info.height);
};
