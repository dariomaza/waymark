import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { MAX_ITEM_PHOTOS, StorageUnitKind } from "@ariadna/domain";
import exifReader from "exif-reader";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  aHugePhoto,
  aPhotoLargerThan,
  aPhotoWithGps,
  aPlainImage,
  aPortraitPhotoNeedingRotation,
  notAnImage,
} from "../photos/testing/image-fixtures.js";
import {
  MAX_UPLOAD_BYTES_IN_TESTS,
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";
import { multipartBody } from "./testing/multipart.js";

interface PhotoView {
  readonly id: string;
  readonly processingStatus: string;
  readonly url: string;
  readonly thumbnailUrl: string;
}

interface ItemView {
  readonly id: string;
  /** Whole views, not ids: a client must never have to build a photo URL. */
  readonly photos: readonly PhotoView[];
  readonly coverPhotoId: string | null;
}

const photoIdsOf = (item: ItemView): string[] => item.photos.map((photo) => photo.id);

/**
 * A unit hands out the whole photo, exactly as an item does. There is no
 * `photoId` on it any more: an id a client has to turn into a URL is the one
 * thing `PhotoView` exists to remove.
 */
interface UnitView {
  readonly id: string;
  readonly photo: PhotoView | null;
}

const errorCodeOf = (response: LightMyRequestResponse): string =>
  (response.json() as { error: { code: string } }).error.code;

describe("photos over HTTP", () => {
  let api: TestApi;
  let token: string;

  beforeAll(async () => {
    api = await createTestApi();
  });

  afterAll(async () => {
    await api.destroy();
  });

  beforeEach(async () => {
    await api.reset();
    await api.createUser(TEST_USERNAME, TEST_PASSWORD);
    token = await api.login();
  });

  const call = async (options: InjectOptions): Promise<LightMyRequestResponse> =>
    api.app.inject({
      ...options,
      headers: { ...options.headers, ...api.authHeaders(token) },
    });

  const createUnit = async (name = "Box 3"): Promise<UnitView> => {
    const response = await call({
      method: "POST",
      url: "/storage-units",
      payload: { name, parentId: null, kind: StorageUnitKind.BOX },
    });
    expect(response.statusCode).toBe(201);

    return (response.json() as { unit: UnitView }).unit;
  };

  const createItem = async (): Promise<ItemView> => {
    const unit = await createUnit(`Box ${Math.random()}`);
    const response = await call({
      method: "POST",
      url: "/items",
      payload: { name: "Cordless drill", storageUnitId: unit.id },
    });
    expect(response.statusCode).toBe(201);

    return (response.json() as { item: ItemView }).item;
  };

  const upload = async (
    url: string,
    bytes: Buffer,
    options: { filename?: string; contentType?: string; field?: string } = {},
  ): Promise<LightMyRequestResponse> => {
    const body = multipartBody({
      field: options.field ?? "file",
      filename: options.filename ?? "photo.jpg",
      contentType: options.contentType ?? "image/jpeg",
      bytes,
    });

    return call({
      method: "POST",
      url,
      payload: body.payload,
      headers: { "content-type": body.contentType },
    });
  };

  const uploadToItem = async (
    itemId: string,
    bytes: Buffer,
    options?: Parameters<typeof upload>[2],
  ): Promise<LightMyRequestResponse> =>
    upload(`/items/${itemId}/photos`, bytes, options);

  const photoOf = (response: LightMyRequestResponse): PhotoView =>
    (response.json() as { photo: PhotoView }).photo;

  describe("every photo route needs a session", () => {
    it.each([
      ["POST", "/items/any/photos"],
      ["POST", "/items/any/photos/order"],
      ["DELETE", "/items/any/photos/any"],
      ["POST", "/storage-units/any/photo"],
      ["DELETE", "/storage-units/any/photo"],
      ["GET", "/photos/any"],
      ["GET", "/photos/any/thumbnail"],
    ])("refuses %s %s without one", async (method, url) => {
      const response = await api.app.inject({ method: method as "GET", url });

      expect(response.statusCode).toBe(401);
    });

    /**
     * Serving is the one that matters. A photo of the inside of somebody's
     * house, on a public hostname, behind a guessable-ish id is not something
     * that gets to be an unauthenticated convenience.
     */
    it("refuses to serve a photo that really exists without a session", async () => {
      const item = await createItem();
      const photo = photoOf(await uploadToItem(item.id, await aPlainImage("jpeg")));

      const anonymous = await api.app.inject({ method: "GET", url: photo.url });

      expect(anonymous.statusCode).toBe(401);
    });
  });

  describe("uploading to an item", () => {
    it("stores the photo and puts it on the item", async () => {
      const item = await createItem();

      const response = await uploadToItem(item.id, await aPlainImage("jpeg"));

      expect(response.statusCode).toBe(201);
      const body = response.json() as { photo: PhotoView; item: ItemView };
      expect(body.photo.processingStatus).toBe("PENDING");
      expect(photoIdsOf(body.item)).toEqual([body.photo.id]);
      expect(body.item.coverPhotoId).toBe(body.photo.id);
    });

    it("tells the client where to fetch both sizes", async () => {
      const item = await createItem();

      const photo = photoOf(await uploadToItem(item.id, await aPlainImage("jpeg")));

      expect(photo.url).toBe(`/photos/${photo.id}`);
      expect(photo.thumbnailUrl).toBe(`/photos/${photo.id}/thumbnail`);
    });

    it("hands the item's photos back as views, so no client builds a URL", async () => {
      const item = await createItem();

      const response = await uploadToItem(item.id, await aPlainImage("jpeg"));

      const [photo] = (response.json() as { item: ItemView }).item.photos;
      expect(photo?.url).toBe(`/photos/${photo?.id ?? ""}`);
      expect(photo?.thumbnailUrl).toBe(`/photos/${photo?.id ?? ""}/thumbnail`);
    });

    it("says on the item that a freshly uploaded photo is still PENDING", async () => {
      const item = await createItem();

      const response = await uploadToItem(item.id, await aPlainImage("jpeg"));

      // Background removal is optional and may never run at all (ADR 4), so
      // this is the normal state of a photo and possibly its final one. A
      // client that only sees ids cannot tell anybody that.
      expect(
        (response.json() as { item: ItemView }).item.photos[0]?.processingStatus,
      ).toBe("PENDING");
    });

    it("keeps the first upload as the cover", async () => {
      const item = await createItem();
      const first = photoOf(await uploadToItem(item.id, await aPlainImage("jpeg")));

      const response = await uploadToItem(item.id, await aPlainImage("png"));

      const body = response.json() as { item: ItemView };
      expect(photoIdsOf(body.item)[0]).toBe(first.id);
      expect(body.item.coverPhotoId).toBe(first.id);
    });

    it.each(["jpeg", "png", "webp"] as const)("accepts a real %s", async (format) => {
      const item = await createItem();

      const response = await uploadToItem(item.id, await aPlainImage(format));

      expect(response.statusCode).toBe(201);
    });

    it("404s for an item that is not there", async () => {
      const response = await uploadToItem("ghost", await aPlainImage("jpeg"));

      expect(response.statusCode).toBe(404);
      expect(errorCodeOf(response)).toBe("ITEM_NOT_FOUND");
    });

    it("refuses once the item is full", async () => {
      const item = await createItem();
      for (let index = 0; index < MAX_ITEM_PHOTOS; index += 1) {
        expect((await uploadToItem(item.id, await aPlainImage("jpeg"))).statusCode).toBe(
          201,
        );
      }

      const response = await uploadToItem(item.id, await aPlainImage("jpeg"));

      // Fix the world, not the request: delete one and the same upload works.
      expect(response.statusCode).toBe(409);
      expect(errorCodeOf(response)).toBe("TOO_MANY_ITEM_PHOTOS");
    });

    it("refuses a request that is not multipart at all", async () => {
      const item = await createItem();

      const response = await call({
        method: "POST",
        url: `/items/${item.id}/photos`,
        payload: { file: "here you go" },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });

    it("refuses multipart with no file part", async () => {
      const item = await createItem();

      const response = await uploadToItem(item.id, await aPlainImage("jpeg"), {
        field: "not-the-file",
      });

      expect(response.statusCode).toBe(400);
      expect(errorCodeOf(response)).toBe("MISSING_PHOTO_UPLOAD");
    });
  });

  describe("the declared content type is not believed", () => {
    /**
     * The single most important test in this file. `Content-Type` is a string
     * the client chose, about bytes the same client chose. This service writes
     * what it accepts to a directory it serves back, on the public internet.
     */
    it("rejects a PHP script calling itself an image/jpeg", async () => {
      const item = await createItem();

      const response = await uploadToItem(item.id, notAnImage(), {
        filename: "photo.jpg",
        contentType: "image/jpeg",
      });

      expect(response.statusCode).toBe(415);
      expect(errorCodeOf(response)).toBe("UNSUPPORTED_IMAGE_FORMAT");
    });

    it("leaves the item untouched when the upload is refused", async () => {
      const item = await createItem();

      await uploadToItem(item.id, notAnImage());

      const after = await call({ method: "GET", url: `/items/${item.id}` });
      expect(photoIdsOf((after.json() as { item: ItemView }).item)).toEqual([]);
    });

    it("writes nothing to disk when the upload is refused", async () => {
      const item = await createItem();
      const before = await countStoredFiles(api.photoRoot);

      await uploadToItem(item.id, notAnImage());

      expect(await countStoredFiles(api.photoRoot)).toBe(before);
    });

    it("rejects an SVG, which is a document that happens to draw", async () => {
      const item = await createItem();
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', "utf8");

      const response = await uploadToItem(item.id, svg, {
        filename: "photo.svg",
        contentType: "image/svg+xml",
      });

      expect(response.statusCode).toBe(415);
    });

    it("accepts a real PNG even when the client calls it a JPEG", async () => {
      const item = await createItem();

      const response = await uploadToItem(item.id, await aPlainImage("png"), {
        contentType: "image/jpeg",
        filename: "lying.jpg",
      });

      // The bytes decide, in both directions.
      expect(response.statusCode).toBe(201);
    });
  });

  describe("privacy: EXIF does not survive the upload", () => {
    it("does not store the GPS coordinates a phone put in the file", async () => {
      const item = await createItem();
      const uploaded = await aPhotoWithGps();

      // The fixture really does carry them.
      const before = await sharp(uploaded).metadata();
      expect(exifReader(before.exif as Buffer).GPSInfo).toBeDefined();

      const photo = photoOf(await uploadToItem(item.id, uploaded));
      const served = await call({ method: "GET", url: photo.url });

      const after = await sharp(served.rawPayload).metadata();
      expect(after.exif).toBeUndefined();
    });

    it("does not leak it through the thumbnail either", async () => {
      const item = await createItem();
      const photo = photoOf(await uploadToItem(item.id, await aPhotoWithGps()));

      const served = await call({ method: "GET", url: photo.thumbnailUrl });

      expect((await sharp(served.rawPayload).metadata()).exif).toBeUndefined();
    });

    it("does not leave the coordinates in the file on disk", async () => {
      const item = await createItem();
      await uploadToItem(item.id, await aPhotoWithGps());

      // Not the response, the bytes at rest. A backup of this volume must not
      // be a map of the house.
      for (const file of await storedFiles(api.photoRoot)) {
        const metadata = await sharp(file).metadata();
        expect(metadata.exif).toBeUndefined();
      }
    });
  });

  describe("orientation", () => {
    /**
     * A phone held upright records landscape pixels plus a tag saying "turn
     * me". Strip the tag before applying it and every portrait photo in the
     * inventory is sideways, permanently.
     */
    it("serves a portrait photo the right way up", async () => {
      const item = await createItem();
      const uploaded = await aPortraitPhotoNeedingRotation(120, 60);
      expect((await sharp(uploaded).metadata()).orientation).toBe(6);

      const photo = photoOf(await uploadToItem(item.id, uploaded));
      const served = await call({ method: "GET", url: photo.url });

      const metadata = await sharp(served.rawPayload).metadata();
      expect(metadata.width).toBe(60);
      expect(metadata.height).toBe(120);
      // And no tag left for a viewer to apply a second time.
      expect(metadata.orientation).toBeUndefined();
    });

    it("turns the thumbnail with it", async () => {
      const item = await createItem();
      const photo = photoOf(
        await uploadToItem(item.id, await aPortraitPhotoNeedingRotation(120, 60)),
      );

      const served = await call({ method: "GET", url: photo.thumbnailUrl });

      const metadata = await sharp(served.rawPayload).metadata();
      expect(metadata.height ?? 0).toBeGreaterThan(metadata.width ?? 0);
    });
  });

  describe("size limits", () => {
    it("refuses an upload past the limit", async () => {
      const item = await createItem();
      const huge = await aPhotoLargerThan(MAX_UPLOAD_BYTES_IN_TESTS);

      const response = await uploadToItem(item.id, huge);

      expect(response.statusCode).toBe(413);
      expect(errorCodeOf(response)).toBe("PHOTO_TOO_LARGE");
    });

    it("stores nothing when an upload is refused for size", async () => {
      const item = await createItem();
      const before = await countStoredFiles(api.photoRoot);

      await uploadToItem(item.id, await aPhotoLargerThan(MAX_UPLOAD_BYTES_IN_TESTS));

      expect(await countStoredFiles(api.photoRoot)).toBe(before);
      const after = await call({ method: "GET", url: `/items/${item.id}` });
      expect(photoIdsOf((after.json() as { item: ItemView }).item)).toEqual([]);
    });

    it("accepts one comfortably under the limit", async () => {
      const item = await createItem();

      const response = await uploadToItem(item.id, await aPlainImage("jpeg", 800, 600));

      expect(response.statusCode).toBe(201);
    });
  });

  describe("serving", () => {
    it("sends the right content type for each stored format", async () => {
      const item = await createItem();

      for (const [format, contentType] of [
        ["jpeg", "image/jpeg"],
        ["png", "image/png"],
        ["webp", "image/webp"],
      ] as const) {
        const photo = photoOf(await uploadToItem(item.id, await aPlainImage(format)));
        const served = await call({ method: "GET", url: photo.url });

        expect(served.statusCode).toBe(200);
        expect(served.headers["content-type"]).toBe(contentType);
      }
    });

    it("always sends a JPEG thumbnail, whatever the original is", async () => {
      const item = await createItem();
      const photo = photoOf(await uploadToItem(item.id, await aPlainImage("png")));

      const served = await call({ method: "GET", url: photo.thumbnailUrl });

      expect(served.headers["content-type"]).toBe("image/jpeg");
    });

    it("sends a thumbnail very much smaller than the photo", async () => {
      const item = await createItem();
      const photo = photoOf(await uploadToItem(item.id, await aHugePhoto(2000, 1500)));

      const [full, thumbnail] = await Promise.all([
        call({ method: "GET", url: photo.url }),
        call({ method: "GET", url: photo.thumbnailUrl }),
      ]);

      expect(thumbnail.rawPayload.byteLength).toBeLessThan(
        full.rawPayload.byteLength / 4,
      );
    });

    /**
     * A freshly uploaded photo is `PENDING` (ADR 4), and `GET /photos/:id` is
     * the one URL whose bytes can still be replaced: the moment background
     * removal finishes, the same id starts serving the processed variant. So
     * this asks for revalidation rather than `immutable`, which would pin the
     * unprocessed version into a phone's cache for a year. Everything else
     * about the header is unchanged — never `public`, always a validator.
     */
    it("asks a client to revalidate while the photo may still be replaced", async () => {
      const item = await createItem();
      const photo = photoOf(await uploadToItem(item.id, await aPlainImage("jpeg")));

      const served = await call({ method: "GET", url: photo.url });

      expect(served.headers["cache-control"]).not.toContain("immutable");
      expect(served.headers["cache-control"]).toContain("must-revalidate");
      // Never `public`: a shared cache must not hold the inside of a house.
      expect(served.headers["cache-control"]).toContain("private");
      expect(served.headers.etag).toBeDefined();
      expect(served.headers["content-length"]).toBe(
        String(served.rawPayload.byteLength),
      );
    });

    /** A thumbnail is written once at upload and is never touched again. */
    it("caches the thumbnail hard, because that file really never changes", async () => {
      const item = await createItem();
      const photo = photoOf(await uploadToItem(item.id, await aPlainImage("jpeg")));

      const served = await call({ method: "GET", url: photo.thumbnailUrl });

      expect(served.headers["cache-control"]).toContain("immutable");
      expect(served.headers["cache-control"]).toContain("private");
      expect(served.headers.etag).toBeDefined();
    });

    it("answers 304 to a client that already has it", async () => {
      const item = await createItem();
      const photo = photoOf(await uploadToItem(item.id, await aPlainImage("jpeg")));
      const first = await call({ method: "GET", url: photo.url });

      const second = await call({
        method: "GET",
        url: photo.url,
        headers: { "if-none-match": String(first.headers.etag) },
      });

      expect(second.statusCode).toBe(304);
      expect(second.rawPayload.length).toBe(0);
    });

    it("404s for a photo that does not exist", async () => {
      const response = await call({ method: "GET", url: "/photos/ghost" });

      expect(response.statusCode).toBe(404);
      expect(errorCodeOf(response)).toBe("PHOTO_NOT_FOUND");
    });

    it("404s rather than traversing when the id is a path", async () => {
      const response = await call({
        method: "GET",
        url: `/photos/${encodeURIComponent("../../../etc/passwd")}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("ordering and the cover", () => {
    const itemWithPhotos = async (count: number) => {
      const item = await createItem();
      const ids: string[] = [];
      for (let index = 0; index < count; index += 1) {
        ids.push(photoOf(await uploadToItem(item.id, await aPlainImage("jpeg"))).id);
      }

      return { item, ids };
    };

    it("chooses the cover by reordering", async () => {
      const { item, ids } = await itemWithPhotos(3);

      const response = await call({
        method: "POST",
        url: `/items/${item.id}/photos/order`,
        payload: { photoIds: [ids[2], ids[0], ids[1]] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { item: ItemView };
      expect(photoIdsOf(body.item)).toEqual([ids[2], ids[0], ids[1]]);
      expect(body.item.coverPhotoId).toBe(ids[2]);
    });

    it("persists the new order", async () => {
      const { item, ids } = await itemWithPhotos(2);
      await call({
        method: "POST",
        url: `/items/${item.id}/photos/order`,
        payload: { photoIds: [ids[1], ids[0]] },
      });

      const reread = await call({ method: "GET", url: `/items/${item.id}` });

      expect(photoIdsOf((reread.json() as { item: ItemView }).item)).toEqual([
        ids[1],
        ids[0],
      ]);
    });

    it("refuses an order that leaves a photo out", async () => {
      const { item, ids } = await itemWithPhotos(3);

      const response = await call({
        method: "POST",
        url: `/items/${item.id}/photos/order`,
        payload: { photoIds: [ids[0], ids[1]] },
      });

      expect(response.statusCode).toBe(422);
      expect(errorCodeOf(response)).toBe("PHOTO_NOT_ON_ITEM");
    });

    it("refuses an order naming a photo from somewhere else", async () => {
      const { item, ids } = await itemWithPhotos(1);
      const elsewhere = await itemWithPhotos(1);

      const response = await call({
        method: "POST",
        url: `/items/${item.id}/photos/order`,
        payload: { photoIds: [elsewhere.ids[0]] },
      });

      expect(response.statusCode).toBe(422);
      expect(ids).toHaveLength(1);
    });
  });

  describe("detaching a photo from an item", () => {
    it("removes it from the list and deletes its files", async () => {
      const item = await createItem();
      const photo = photoOf(await uploadToItem(item.id, await aPlainImage("jpeg")));

      const response = await call({
        method: "DELETE",
        url: `/items/${item.id}/photos/${photo.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { item: ItemView; releasedPhotoIds: string[] };
      expect(photoIdsOf(body.item)).toEqual([]);
      expect(body.releasedPhotoIds).toEqual([photo.id]);
      expect((await call({ method: "GET", url: photo.url })).statusCode).toBe(404);
      expect(await countStoredFiles(api.photoRoot)).toBe(0);
    });

    it("promotes the next photo to cover", async () => {
      const item = await createItem();
      const first = photoOf(await uploadToItem(item.id, await aPlainImage("jpeg")));
      const second = photoOf(await uploadToItem(item.id, await aPlainImage("png")));

      const response = await call({
        method: "DELETE",
        url: `/items/${item.id}/photos/${first.id}`,
      });

      expect((response.json() as { item: ItemView }).item.coverPhotoId).toBe(second.id);
    });

    it("refuses a photo the item does not hold", async () => {
      const item = await createItem();
      const elsewhere = await createItem();
      const photo = photoOf(await uploadToItem(elsewhere.id, await aPlainImage("jpeg")));

      const response = await call({
        method: "DELETE",
        url: `/items/${item.id}/photos/${photo.id}`,
      });

      expect(response.statusCode).toBe(422);
      expect(errorCodeOf(response)).toBe("PHOTO_NOT_ON_ITEM");
      // And it is very much still there.
      expect((await call({ method: "GET", url: photo.url })).statusCode).toBe(200);
    });
  });

  describe("deleting an item removes its files", () => {
    /**
     * `DELETE /items/:id` already answered with `releasedPhotoIds` (ADR 3).
     * This is the half that was missing: the files actually going away.
     */
    it("takes both variants of every photo with it", async () => {
      const item = await createItem();
      const first = photoOf(await uploadToItem(item.id, await aPlainImage("jpeg")));
      const second = photoOf(await uploadToItem(item.id, await aPlainImage("png")));

      const response = await call({ method: "DELETE", url: `/items/${item.id}` });

      expect(response.statusCode).toBe(200);
      expect(
        (response.json() as { releasedPhotoIds: string[] }).releasedPhotoIds,
      ).toEqual([first.id, second.id]);
      expect(await countStoredFiles(api.photoRoot)).toBe(0);
    });

    it("leaves another item's photos alone", async () => {
      const mine = await createItem();
      await uploadToItem(mine.id, await aPlainImage("jpeg"));
      const yours = await createItem();
      const theirs = photoOf(await uploadToItem(yours.id, await aPlainImage("jpeg")));

      await call({ method: "DELETE", url: `/items/${mine.id}` });

      expect((await call({ method: "GET", url: theirs.url })).statusCode).toBe(200);
      expect(await countStoredFiles(api.photoRoot)).toBe(2);
    });

    it("deletes an item that has no photos at all without complaining", async () => {
      const item = await createItem();

      const response = await call({ method: "DELETE", url: `/items/${item.id}` });

      expect(response.statusCode).toBe(200);
      expect(
        (response.json() as { releasedPhotoIds: string[] }).releasedPhotoIds,
      ).toEqual([]);
    });
  });

  describe("the one photo of a storage unit", () => {
    it("uploads and attaches it", async () => {
      const unit = await createUnit();

      const response = await upload(
        `/storage-units/${unit.id}/photo`,
        await aPlainImage("jpeg"),
      );

      expect(response.statusCode).toBe(201);
      const body = response.json() as { photo: PhotoView; unit: UnitView };
      expect(body.unit.photo).toEqual(body.photo);
    });

    it("replaces the previous one and deletes its files", async () => {
      const unit = await createUnit();
      const old = photoOf(
        await upload(`/storage-units/${unit.id}/photo`, await aPlainImage("jpeg")),
      );

      const response = await upload(
        `/storage-units/${unit.id}/photo`,
        await aPlainImage("png"),
      );

      const body = response.json() as { unit: UnitView; releasedPhotoIds: string[] };
      expect(body.releasedPhotoIds).toEqual([old.id]);
      expect((await call({ method: "GET", url: old.url })).statusCode).toBe(404);
      // Exactly one photo's worth of files: two variants.
      expect(await countStoredFiles(api.photoRoot)).toBe(2);
    });

    it("clears it and releases the files", async () => {
      const unit = await createUnit();
      const photo = photoOf(
        await upload(`/storage-units/${unit.id}/photo`, await aPlainImage("jpeg")),
      );

      const response = await call({
        method: "DELETE",
        url: `/storage-units/${unit.id}/photo`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { unit: UnitView; releasedPhotoIds: string[] };
      expect(body.unit.photo).toBeNull();
      expect(body.releasedPhotoIds).toEqual([photo.id]);
      expect(await countStoredFiles(api.photoRoot)).toBe(0);
    });

    it("clearing a unit with no photo is a no-op", async () => {
      const unit = await createUnit();

      const response = await call({
        method: "DELETE",
        url: `/storage-units/${unit.id}/photo`,
      });

      expect(response.statusCode).toBe(200);
      expect(
        (response.json() as { releasedPhotoIds: string[] }).releasedPhotoIds,
      ).toEqual([]);
    });

    it("404s for a unit that is not there", async () => {
      const response = await upload(
        "/storage-units/ghost/photo",
        await aPlainImage("jpeg"),
      );

      expect(response.statusCode).toBe(404);
      expect(errorCodeOf(response)).toBe("STORAGE_UNIT_NOT_FOUND");
    });
  });

  /**
   * # A unit's photo is a photo, and only where a unit is the subject
   *
   * An id forces a client to build `/photos/<id>` by hand, which is the one
   * thing `PhotoView` exists to stop, and it hides `processingStatus` so a
   * unit photo still waiting for a background removal that may never happen
   * (ADR 4) looks identical to a settled one.
   *
   * The reason it stayed an id was that `storageUnitView` also projects every
   * breadcrumb step, every child row, every tree node and every search hit,
   * and none of those draws a photo. So the whole photo is added ONLY to the
   * projections where a unit is what the answer is about, and the rows lost
   * the id they could never use — which makes them smaller, not larger.
   */
  describe("where a unit's photo shows up, and where it does not", () => {
    const unitOf = (response: LightMyRequestResponse): UnitView =>
      (response.json() as { unit: UnitView }).unit;

    it("carries the whole photo on the unit's own screen", async () => {
      const unit = await createUnit();
      const uploaded = photoOf(
        await upload(`/storage-units/${unit.id}/photo`, await aPlainImage("jpeg")),
      );

      const response = await call({ method: "GET", url: `/storage-units/${unit.id}` });

      expect(response.statusCode).toBe(200);
      expect(unitOf(response).photo).toEqual({
        id: uploaded.id,
        processingStatus: "PENDING",
        url: `/photos/${uploaded.id}`,
        thumbnailUrl: `/photos/${uploaded.id}/thumbnail`,
      });
    });

    it("hands out URLs that actually serve bytes, so nothing has to be built", async () => {
      const unit = await createUnit();
      await upload(`/storage-units/${unit.id}/photo`, await aPlainImage("jpeg"));

      const photo = unitOf(
        await call({ method: "GET", url: `/storage-units/${unit.id}` }),
      ).photo;

      expect(photo).not.toBeNull();
      const [full, thumbnail] = await Promise.all([
        call({ method: "GET", url: (photo as PhotoView).url }),
        call({ method: "GET", url: (photo as PhotoView).thumbnailUrl }),
      ]);
      expect(full.statusCode).toBe(200);
      expect(thumbnail.statusCode).toBe(200);
    });

    it("says null rather than nothing when a unit has no photo", async () => {
      const unit = await createUnit();

      const response = await call({ method: "GET", url: `/storage-units/${unit.id}` });

      expect(unitOf(response).photo).toBeNull();
    });

    it("carries it on every answer whose subject is one unit", async () => {
      const unit = await createUnit();
      const uploaded = photoOf(
        await upload(`/storage-units/${unit.id}/photo`, await aPlainImage("jpeg")),
      );

      const [patched, moved] = await Promise.all([
        call({
          method: "PATCH",
          url: `/storage-units/${unit.id}`,
          payload: { name: "Box 4" },
        }),
        call({
          method: "POST",
          url: `/storage-units/${unit.id}/move`,
          payload: { parentId: null },
        }),
      ]);

      expect(unitOf(patched).photo?.id).toBe(uploaded.id);
      expect(unitOf(moved).photo?.id).toBe(uploaded.id);
    });

    it("leaves the rows alone: no photo and no photo id on a breadcrumb, a child or a tree node", async () => {
      const parent = await createUnit("Garage");
      const child = (
        await call({
          method: "POST",
          url: "/storage-units",
          payload: { name: "Box 3", parentId: parent.id, kind: StorageUnitKind.BOX },
        })
      ).json() as { unit: UnitView };
      await upload(`/storage-units/${child.unit.id}/photo`, await aPlainImage("jpeg"));

      const detail = (
        await call({ method: "GET", url: `/storage-units/${child.unit.id}` })
      ).json() as {
        unit: Record<string, unknown>;
        path: readonly Record<string, unknown>[];
      };
      const tree = (await call({ method: "GET", url: "/storage-units" })).json() as {
        tree: readonly Record<string, unknown>[];
      };
      const children = (
        await call({ method: "GET", url: `/storage-units/${parent.id}` })
      ).json() as { children: readonly Record<string, unknown>[] };

      // The unit itself is the subject of that answer, so it carries one.
      expect(detail.unit).toHaveProperty("photo");
      expect(detail.unit).not.toHaveProperty("photoId");

      // Every one of these is a row about somewhere else.
      for (const row of [...detail.path, ...tree.tree, ...children.children]) {
        expect(row).not.toHaveProperty("photo");
        expect(row).not.toHaveProperty("photoId");
      }
      // And the row in question really is the unit with the photo on it.
      expect(detail.path.at(-1)?.["id"]).toBe(child.unit.id);
    });
  });
});

/** Every file under the photo root, as absolute paths. */
const storedFiles = async (root: string): Promise<string[]> => {
  const found: string[] = [];
  let buckets: string[];
  try {
    buckets = await readdir(root);
  } catch {
    return found;
  }

  for (const bucket of buckets) {
    const bucketPath = join(root, bucket);
    if (!(await stat(bucketPath)).isDirectory()) {
      continue;
    }
    for (const file of await readdir(bucketPath)) {
      found.push(join(bucketPath, file));
    }
  }

  return found;
};

const countStoredFiles = async (root: string): Promise<number> =>
  (await storedFiles(root)).length;
