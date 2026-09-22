import { publicId } from "@waymark/domain";
import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  QR_ERROR_CORRECTION_LEVEL,
  renderStorageUnitQrPng,
  renderStorageUnitQrSvg,
  storageUnitUrl,
} from "./storage-unit-qr.js";
import { decodeQrPng, decodeQrSvg } from "./testing/decode-qr.js";

const A_PUBLIC_ID = publicId("7ZQ4KM2XPT");

describe("the URL a storage unit QR carries", () => {
  it("is an absolute page URL, not a bare id", () => {
    expect(storageUnitUrl("https://ariadna.example", A_PUBLIC_ID)).toBe(
      "https://ariadna.example/u/7ZQ4KM2XPT",
    );
  });

  it("does not double the slash when the base already ends in one", () => {
    expect(storageUnitUrl("https://ariadna.example/", A_PUBLIC_ID)).toBe(
      "https://ariadna.example/u/7ZQ4KM2XPT",
    );
  });

  it("keeps a path prefix the base URL already has", () => {
    expect(storageUnitUrl("https://home.example/ariadna", A_PUBLIC_ID)).toBe(
      "https://home.example/ariadna/u/7ZQ4KM2XPT",
    );
  });

  it("needs no percent encoding, because the alphabet is URL safe", () => {
    const url = storageUnitUrl("https://ariadna.example", A_PUBLIC_ID);

    expect(encodeURI(url)).toBe(url);
  });
});

describe("storage unit QR rendering", () => {
  const url = storageUnitUrl("https://ariadna.example", A_PUBLIC_ID);

  it("corrects a quarter of the symbol, for labels that live in a garage", () => {
    expect(QR_ERROR_CORRECTION_LEVEL).toBe("Q");
  });

  it("renders a PNG that decodes back to the unit URL", async () => {
    const png = await renderStorageUnitQrPng(url);

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    await expect(decodeQrPng(png)).resolves.toBe(url);
  });

  it("renders an SVG that decodes back to the unit URL", async () => {
    const svg = await renderStorageUnitQrSvg(url);

    expect(svg.trimStart()).toMatch(/^<svg\b/u);
    await expect(decodeQrSvg(svg)).resolves.toBe(url);
  });

  it("gives the same bytes for the same URL, so a printed label stays valid", async () => {
    const [first, second] = await Promise.all([
      renderStorageUnitQrPng(url),
      renderStorageUnitQrPng(url),
    ]);

    expect(first.equals(second)).toBe(true);
  });

  it("gives different symbols to different units", async () => {
    const other = storageUnitUrl("https://ariadna.example", publicId("0123456789"));

    await expect(decodeQrPng(await renderStorageUnitQrPng(other))).resolves.toBe(other);
    expect((await renderStorageUnitQrPng(other)).equals(await renderStorageUnitQrPng(url))).toBe(
      false,
    );
  });

  it("survives a scuff a weaker level would not", async () => {
    // A centred square, well clear of the three finder patterns in the corners.
    // Those are how a decoder LOCATES the symbol and are not error-corrected
    // codewords, so no level protects them; what a level buys is tolerance of
    // damage to the DATA, which is what a scuffed box actually suffers.
    const scuff = 0.28;

    await expect(
      decodeQrPng(await scuffCentre(await renderStorageUnitQrPng(url), scuff)),
    ).resolves.toBe(url);

    // The same damage, at the levels that were rejected. This is the assertion
    // that makes the choice in `QR_ERROR_CORRECTION_LEVEL` a decision rather
    // than a preference: both weaker levels lose the URL entirely here.
    for (const weaker of ["L", "M"] as const) {
      const symbol = await QRCode.toBuffer(url, {
        type: "png",
        errorCorrectionLevel: weaker,
        margin: 4,
        width: 512,
      });

      await expect(decodeQrPng(await scuffCentre(symbol, scuff))).resolves.toBeNull();
    }
  });
});

/** Paints a grey square of `side` (as a fraction of the image) in the middle. */
const scuffCentre = async (png: Buffer, side: number): Promise<Buffer> => {
  const image = sharp(png);
  const { width = 0, height = 0 } = await image.metadata();
  const scuffWidth = Math.round(width * side);
  const scuffHeight = Math.round(height * side);

  const scuff = await sharp({
    create: {
      width: scuffWidth,
      height: scuffHeight,
      channels: 3,
      background: { r: 120, g: 120, b: 120 },
    },
  })
    .png()
    .toBuffer();

  return sharp(png)
    .composite([
      {
        input: scuff,
        top: Math.round((height - scuffHeight) / 2),
        left: Math.round((width - scuffWidth) / 2),
      },
    ])
    .png()
    .toBuffer();
};
