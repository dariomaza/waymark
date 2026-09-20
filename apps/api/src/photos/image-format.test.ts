import sharp, { type Sharp } from "sharp";
import { describe, expect, it } from "vitest";

import {
  SUPPORTED_IMAGE_FORMATS,
  contentTypeOf,
  extensionOf,
  sniffImageFormat,
} from "./image-format.js";

const aPixel = (): Sharp =>
  sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
  });

describe("sniffing the format out of the bytes", () => {
  it.each(SUPPORTED_IMAGE_FORMATS)("recognises a real %s", async (format) => {
    const bytes = await aPixel().toFormat(format).toBuffer();

    expect(sniffImageFormat(bytes)).toBe(format);
  });

  /**
   * The point of the whole exercise. `Content-Type` is a claim the client
   * makes about bytes it also chose; believing it means a `.php`, an HTML
   * document or a zip lands in the photo directory of an internet-facing
   * service and gets served back with an `image/jpeg` header.
   */
  it("rejects a text file dressed up as a JPEG", () => {
    const lie = Buffer.from("<?php system($_GET['c']); ?>", "utf8");

    expect(sniffImageFormat(lie)).toBeNull();
  });

  it("rejects a zip, whatever it is called", () => {
    expect(sniffImageFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toBeNull();
  });

  it("rejects an empty upload", () => {
    expect(sniffImageFormat(Buffer.alloc(0))).toBeNull();
  });

  it("rejects something too short to have a signature", () => {
    expect(sniffImageFormat(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  /**
   * An SVG is a document, not a picture: it can carry script and external
   * references, and a browser shown one from this origin runs it. It is
   * excluded on purpose rather than by omission.
   */
  it("rejects an SVG even though it is an image", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8");

    expect(sniffImageFormat(svg)).toBeNull();
  });

  it("rejects a GIF, which is a format this service does not support", async () => {
    const gif = await aPixel().gif().toBuffer();

    expect(sniffImageFormat(gif)).toBeNull();
  });

  it("rejects a TIFF", async () => {
    const tiff = await aPixel().tiff().toBuffer();

    expect(sniffImageFormat(tiff)).toBeNull();
  });

  it("rejects an AVIF, whose decoder is a bigger attack surface than it is worth", async () => {
    const avif = await aPixel().avif({ effort: 0 }).toBuffer();

    expect(sniffImageFormat(avif)).toBeNull();
  });

  it("does not mistake a RIFF container that is not a WebP for one", () => {
    // RIFF....WAVE — a sound file, four bytes away from looking like a WebP.
    const wav = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from("WAVEfmt ", "ascii"),
    ]);

    expect(sniffImageFormat(wav)).toBeNull();
  });
});

describe("what a sniffed format is served and stored as", () => {
  it.each([
    ["jpeg", "image/jpeg", "jpg"],
    ["png", "image/png", "png"],
    ["webp", "image/webp", "webp"],
  ] as const)("maps %s", (format, contentType, extension) => {
    expect(contentTypeOf(format)).toBe(contentType);
    expect(extensionOf(format)).toBe(extension);
  });

  it("supports exactly three formats, and says which", () => {
    expect([...SUPPORTED_IMAGE_FORMATS]).toEqual(["jpeg", "png", "webp"]);
  });
});
