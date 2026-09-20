import exifReader from "exif-reader";
import sharp, { type Metadata } from "sharp";
import { describe, expect, it } from "vitest";

import { UnsupportedImageFormat } from "./photo-errors.js";
import {
  MAX_STORED_EDGE_PX,
  THUMBNAIL_EDGE_PX,
  ingestPhoto,
} from "./photo-ingestion.js";
import {
  aHugePhoto,
  aPhotoWithGps,
  aPngDeclaringHugeDimensions,
  aPlainImage,
  aPortraitPhotoNeedingRotation,
  notAnImage,
} from "./testing/image-fixtures.js";

const metadataOf = (bytes: Buffer): Promise<Metadata> =>
  sharp(bytes).metadata();

describe("ingesting an upload", () => {
  describe("EXIF is stripped, because this service is on the internet", () => {
    it("does not carry GPS coordinates through", async () => {
      const uploaded = await aPhotoWithGps();

      // The fixture really does carry them, or the assertion below proves
      // nothing at all.
      const before = await metadataOf(uploaded);
      expect(before.exif).toBeDefined();
      expect(exifReader(before.exif as Buffer).GPSInfo).toBeDefined();

      const ingested = await ingestPhoto(uploaded);

      expect((await metadataOf(ingested.original)).exif).toBeUndefined();
    });

    it("strips the metadata from the thumbnail too", async () => {
      const ingested = await ingestPhoto(await aPhotoWithGps());

      expect((await metadataOf(ingested.thumbnail)).exif).toBeUndefined();
    });

    it("leaves nothing identifying behind, not even the camera make", async () => {
      const ingested = await ingestPhoto(await aPhotoWithGps());
      const metadata = await metadataOf(ingested.original);

      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(metadata.iptc).toBeUndefined();
    });
  });

  describe("orientation is applied before the metadata goes", () => {
    /**
     * The order is the whole trick. A phone held upright records LANDSCAPE
     * pixels plus an EXIF tag saying "turn me". Strip the tag first and the
     * pixels are all that is left, so every portrait photo in the inventory is
     * on its side forever.
     */
    it("rotates a portrait photo upright", async () => {
      const uploaded = await aPortraitPhotoNeedingRotation(120, 60);

      expect((await metadataOf(uploaded)).orientation).toBe(6);

      const ingested = await ingestPhoto(uploaded);
      const stored = await metadataOf(ingested.original);

      // 120x60 sensor pixels, turned a quarter, is 60x120 on screen.
      expect(stored.width).toBe(60);
      expect(stored.height).toBe(120);
      expect(ingested.width).toBe(60);
      expect(ingested.height).toBe(120);
    });

    it("leaves the tag behind once it has been honoured", async () => {
      const ingested = await ingestPhoto(await aPortraitPhotoNeedingRotation());

      // No tag AND already rotated: a viewer applying the tag a second time
      // would put the photo back on its side.
      expect((await metadataOf(ingested.original)).orientation).toBeUndefined();
    });

    it("turns the thumbnail the same way", async () => {
      const ingested = await ingestPhoto(await aPortraitPhotoNeedingRotation(120, 60));
      const thumbnail = await metadataOf(ingested.thumbnail);

      expect(thumbnail.height ?? 0).toBeGreaterThan(thumbnail.width ?? 0);
    });

    it("leaves an already upright photo alone", async () => {
      const ingested = await ingestPhoto(await aPlainImage("jpeg", 64, 48));

      expect(ingested.width).toBe(64);
      expect(ingested.height).toBe(48);
    });
  });

  describe("a thumbnail is always produced", () => {
    it("fits inside the thumbnail box", async () => {
      const ingested = await ingestPhoto(await aHugePhoto(1600, 1200));
      const thumbnail = await metadataOf(ingested.thumbnail);

      expect(Math.max(thumbnail.width ?? 0, thumbnail.height ?? 0)).toBe(
        THUMBNAIL_EDGE_PX,
      );
    });

    it("keeps the aspect ratio", async () => {
      const ingested = await ingestPhoto(await aHugePhoto(1600, 800));
      const thumbnail = await metadataOf(ingested.thumbnail);

      expect((thumbnail.width ?? 0) / (thumbnail.height ?? 1)).toBeCloseTo(2, 1);
    });

    it("is very much smaller than the original, which is the entire point", async () => {
      const ingested = await ingestPhoto(await aHugePhoto(2400, 1800));

      expect(ingested.thumbnail.byteLength).toBeLessThan(
        ingested.original.byteLength / 4,
      );
    });

    it("never enlarges a photo that is already tiny", async () => {
      const ingested = await ingestPhoto(await aPlainImage("jpeg", 40, 30));
      const thumbnail = await metadataOf(ingested.thumbnail);

      expect(thumbnail.width).toBe(40);
      expect(thumbnail.height).toBe(30);
    });

    it("is always a JPEG, whatever went in", async () => {
      const ingested = await ingestPhoto(await aPlainImage("png"));

      expect((await metadataOf(ingested.thumbnail)).format).toBe("jpeg");
    });
  });

  describe("the stored original", () => {
    it("keeps the format it arrived in", async () => {
      for (const format of ["jpeg", "png", "webp"] as const) {
        const ingested = await ingestPhoto(await aPlainImage(format));

        expect(ingested.format).toBe(format);
        expect((await metadataOf(ingested.original)).format).toBe(format);
      }
    });

    it("is capped at a sane edge, so a 50 megapixel phone photo is not stored whole", async () => {
      const ingested = await ingestPhoto(await aHugePhoto(6000, 4000));

      expect(ingested.width).toBe(MAX_STORED_EDGE_PX);
      expect(ingested.height).toBe(Math.round((MAX_STORED_EDGE_PX * 4000) / 6000));
    });

    it("leaves a photo under the cap at its own size", async () => {
      const ingested = await ingestPhoto(await aHugePhoto(800, 600));

      expect(ingested.width).toBe(800);
    });
  });

  describe("refusals", () => {
    it("refuses bytes that are not an image, whatever they claim to be", async () => {
      await expect(ingestPhoto(notAnImage())).rejects.toBeInstanceOf(
        UnsupportedImageFormat,
      );
    });

    it("refuses a supported signature with garbage behind it", async () => {
      const jpegHeaderOnly = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff]),
        Buffer.alloc(64, 0x41),
      ]);

      await expect(ingestPhoto(jpegHeaderOnly)).rejects.toBeInstanceOf(
        UnsupportedImageFormat,
      );
    });

    it("refuses a format it does not support even when it can decode it", async () => {
      const gif = await sharp({
        create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .gif()
        .toBuffer();

      await expect(ingestPhoto(gif)).rejects.toBeInstanceOf(UnsupportedImageFormat);
    });

    it("refuses an empty upload", async () => {
      await expect(ingestPhoto(Buffer.alloc(0))).rejects.toBeInstanceOf(
        UnsupportedImageFormat,
      );
    });

    /**
     * A decompression bomb: a few kilobytes of file that expands to gigabytes
     * of pixels. Rejecting it on declared dimensions, before any decoding, is
     * the only order that helps.
     */
    it("refuses an image whose declared dimensions are absurd", async () => {
      const bomb = await aPngDeclaringHugeDimensions(30_000, 30_000);

      // A few hundred bytes on the wire, 2.7 gigapixels if anybody decodes it.
      expect(bomb.byteLength).toBeLessThan(1_000);
      await expect(ingestPhoto(bomb)).rejects.toBeInstanceOf(UnsupportedImageFormat);
    });
  });
});
