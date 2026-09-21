import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  EncodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  MultiFormatWriter,
  QRCodeDecoderErrorCorrectionLevel,
  RGBLuminanceSource,
} from "@zxing/library";

/**
 * # A real QR symbol, and reading one back
 *
 * The label sheet's whole job is to put the RIGHT symbol next to the right
 * name. Twelve QR squares on a page look identical, so a test that only
 * asserts twelve images exist would pass with all twelve pointing at the same
 * box — which is the bug that wastes an afternoon and a sheet of stickers.
 *
 * So the symbols the API is stubbed with are real ones, encoded here at the
 * same error correction level the API uses (Q — ADR 9's reasoning: L is sized
 * for a screen and H shrinks the modules until a camera cannot resolve them),
 * and the test decodes what the app actually drew. Both halves go through
 * `@zxing/library`, which this app already depends on for scanning, so the
 * encoder and the decoder are somebody else's code with somebody else's idea
 * of correct.
 *
 * What is written here is only the serialisation: one `<rect>` per dark
 * module at integer coordinates, because jsdom has no pixels and the point is
 * to carry a bit pattern through a `Blob`, an object URL and an `<img>` and
 * get the same bits out.
 */

/** Matches `QR_ERROR_CORRECTION_LEVEL` and `QUIET_ZONE_MODULES` in the API. */
const LEVEL = QRCodeDecoderErrorCorrectionLevel.Q;
const QUIET_ZONE_MODULES = 4;

/** Enough pixels per module for a binarizer built for photographs. */
const PIXELS_PER_MODULE = 8;

export const aQrSvg = (payload: string): string => {
  const hints = new Map<EncodeHintType, unknown>();
  hints.set(EncodeHintType.ERROR_CORRECTION, LEVEL);
  hints.set(EncodeHintType.MARGIN, QUIET_ZONE_MODULES);

  const matrix = new MultiFormatWriter().encode(
    payload,
    BarcodeFormat.QR_CODE,
    0,
    0,
    hints,
  );
  const size = matrix.getWidth();

  const modules: string[] = [];
  for (let y = 0; y < matrix.getHeight(); y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (matrix.get(x, y)) {
        modules.push(`<rect x="${String(x)}" y="${String(y)}" width="1" height="1"/>`);
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(size)} ${String(size)}">` +
    `<rect width="${String(size)}" height="${String(size)}" fill="#ffffff"/>` +
    `<g fill="#000000">${modules.join("")}</g>` +
    `</svg>`
  );
};

/** What a camera pointed at that symbol would read. */
export const decodeQrSvg = (svg: string): string => {
  const document_ = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = document_.querySelector("svg");
  if (root === null) {
    throw new Error("that is not an SVG");
  }

  const [, , width] = (root.getAttribute("viewBox") ?? "").split(" ").map(Number);
  const size = width ?? 0;
  if (size <= 0) {
    throw new Error("the SVG carries no module grid");
  }

  const dark = new Set<string>();
  for (const rect of document_.querySelectorAll("g rect")) {
    dark.add(`${rect.getAttribute("x") ?? ""},${rect.getAttribute("y") ?? ""}`);
  }

  const pixels = size * PIXELS_PER_MODULE;
  const luminances = new Uint8ClampedArray(pixels * pixels);
  for (let y = 0; y < pixels; y += 1) {
    for (let x = 0; x < pixels; x += 1) {
      const key = `${String(Math.floor(x / PIXELS_PER_MODULE))},${String(
        Math.floor(y / PIXELS_PER_MODULE),
      )}`;
      luminances[y * pixels + x] = dark.has(key) ? 0 : 255;
    }
  }

  const reader = new MultiFormatReader();
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);

  return reader
    .decode(
      new BinaryBitmap(
        new HybridBinarizer(new RGBLuminanceSource(luminances, pixels, pixels)),
      ),
    )
    .getText();
};
