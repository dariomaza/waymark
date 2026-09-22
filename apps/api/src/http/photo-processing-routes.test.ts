import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PhotoProcessingStatus, StorageUnitKind } from "@waymark/domain";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { aCutout, aPlainImage } from "../photos/testing/image-fixtures.js";
import {
  anUnusedSidecarUrl,
  hangs,
  respondsWith,
  respondsWithCutout,
  startStubSidecar,
  type StubSidecar,
} from "../photos/testing/stub-sidecar.js";
import { multipartBody } from "./testing/multipart.js";
import {
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

interface PhotoView {
  readonly id: string;
  readonly processingStatus: string;
}

interface ProcessingView {
  readonly processor: {
    readonly enabled: boolean;
    readonly url: string | null;
    readonly reachable: boolean | null;
  };
  readonly counts: Record<string, number>;
  readonly abandoned: readonly {
    readonly photoId: string;
    readonly attempts: number;
    readonly lastError: string;
    readonly lastAttemptAt: string;
  }[];
}

/**
 * The end of the rope ADR 4 describes, over real HTTP: an upload that never
 * waits for background removal, a photo that is served from its original until
 * a worker has something better, and a way to see and retry what failed without
 * opening a shell on the server.
 */
describe("background removal over HTTP", () => {
  describe("with a sidecar", () => {
    let api: TestApi;
    let sidecar: StubSidecar;
    let token: string;
    let cutout: Buffer;

    beforeAll(async () => {
      cutout = await aCutout(120, 60);
      sidecar = await startStubSidecar(respondsWithCutout(cutout));
      api = await createTestApi({
        imageProcessor: { baseUrl: sidecar.url, maxAttempts: 2, timeoutMs: 300 },
      });
    });

    afterAll(async () => {
      await api.destroy();
      await sidecar.close();
    });

    beforeEach(async () => {
      await api.reset();
      await api.createUser(TEST_USERNAME, TEST_PASSWORD);
      token = await api.login();
      sidecar.respondWith(respondsWithCutout(cutout));
    });

    const call = async (options: InjectOptions): Promise<LightMyRequestResponse> =>
      api.app.inject({
        ...options,
        headers: { ...options.headers, ...api.authHeaders(token) },
      });

    const uploadPhoto = async (): Promise<PhotoView> => {
      const unit = (
        (
          await call({
            method: "POST",
            url: "/storage-units",
            payload: { name: "Box 3", parentId: null, kind: StorageUnitKind.BOX },
          })
        ).json() as { unit: { id: string } }
      ).unit;

      const body = multipartBody({
        field: "file",
        filename: "thing.jpg",
        contentType: "image/jpeg",
        bytes: await aPlainImage("jpeg", 120, 60),
      });
      const response = await call({
        method: "POST",
        url: `/storage-units/${unit.id}/photo`,
        headers: { "content-type": body.contentType },
        payload: body.payload,
      });
      expect(response.statusCode).toBe(201);

      return (response.json() as { photo: PhotoView }).photo;
    };

    /**
     * The same upload, addressed to an item instead of a unit, because the
     * per-photo state a client shows lives on `ItemView.photos`.
     */
    const anItemWithAPhoto = async (): Promise<{
      readonly itemId: string;
      readonly photo: PhotoView;
    }> => {
      const unit = (
        (
          await call({
            method: "POST",
            url: "/storage-units",
            payload: { name: "Box 3", parentId: null, kind: StorageUnitKind.BOX },
          })
        ).json() as { unit: { id: string } }
      ).unit;
      const item = (
        (
          await call({
            method: "POST",
            url: "/items",
            payload: { name: "Cordless drill", storageUnitId: unit.id },
          })
        ).json() as { item: { id: string } }
      ).item;

      const body = multipartBody({
        field: "file",
        filename: "thing.jpg",
        contentType: "image/jpeg",
        bytes: await aPlainImage("jpeg", 120, 60),
      });
      const response = await call({
        method: "POST",
        url: `/items/${item.id}/photos`,
        headers: { "content-type": body.contentType },
        payload: body.payload,
      });
      expect(response.statusCode).toBe(201);

      return {
        itemId: item.id,
        photo: (response.json() as { photo: PhotoView }).photo,
      };
    };

    const processing = async (): Promise<ProcessingView> => {
      const response = await call({ method: "GET", url: "/photos/processing" });
      expect(response.statusCode).toBe(200);

      return response.json() as ProcessingView;
    };

    describe("an upload is never held up by it", () => {
      it("answers 201 with the photo still PENDING", async () => {
        const photo = await uploadPhoto();

        expect(photo.processingStatus).toBe(PhotoProcessingStatus.PENDING);
      });

      it("serves the original until something better exists", async () => {
        const photo = await uploadPhoto();

        const response = await call({ method: "GET", url: `/photos/${photo.id}` });

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toBe("image/jpeg");
        expect(response.rawPayload.byteLength).toBeGreaterThan(0);
      });

      /**
       * A `PENDING` photo is the one case where the bytes behind an id DO
       * change: the worker is about to replace them with the processed variant.
       * Handing a phone `immutable` for a year at that moment would pin the
       * un-processed version into its cache for good.
       */
      it("does not promise that a pending photo is immutable", async () => {
        const photo = await uploadPhoto();

        const response = await call({ method: "GET", url: `/photos/${photo.id}` });

        expect(response.headers["cache-control"]).not.toContain("immutable");
      });
    });

    describe("once the worker has run", () => {
      it("marks the photo DONE and serves the white-background version", async () => {
        const photo = await uploadPhoto();
        const original = await call({ method: "GET", url: `/photos/${photo.id}` });

        await api.runProcessing();

        const after = await call({ method: "GET", url: `/photos/${photo.id}` });
        expect(after.statusCode).toBe(200);
        expect(after.headers["content-type"]).toBe("image/jpeg");
        expect(after.rawPayload).not.toEqual(original.rawPayload);

        // The half the cutout left transparent has to arrive white, not black.
        const { data, info } = await sharp(after.rawPayload)
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect(info.channels).toBe(3);
        const topRight = (info.width - 1) * 3;
        expect(data[topRight]).toBeGreaterThan(240);
      });

      it("serves it from the processed file on the volume", async () => {
        const photo = await uploadPhoto();
        await api.runProcessing();

        const response = await call({ method: "GET", url: `/photos/${photo.id}` });

        const onDisk = await readFile(
          join(api.photoRoot, api.processedPathOf(photo.id)),
        );
        expect(response.rawPayload).toEqual(onDisk);
      });

      it("promises immutability once the bytes have settled", async () => {
        const photo = await uploadPhoto();
        await api.runProcessing();

        const response = await call({ method: "GET", url: `/photos/${photo.id}` });

        expect(response.headers["cache-control"]).toContain("immutable");
      });

      it("says on the item itself that its photo has become DONE", async () => {
        const { itemId } = await anItemWithAPhoto();

        const before = await call({ method: "GET", url: `/items/${itemId}` });
        expect(
          (before.json() as { item: { photos: readonly PhotoView[] } }).item.photos[0]
            ?.processingStatus,
        ).toBe(PhotoProcessingStatus.PENDING);

        await api.runProcessing();

        const after = await call({ method: "GET", url: `/items/${itemId}` });
        expect(
          (after.json() as { item: { photos: readonly PhotoView[] } }).item.photos[0]
            ?.processingStatus,
        ).toBe(PhotoProcessingStatus.DONE);
      });

      it("keeps serving the thumbnail from the original", async () => {
        const photo = await uploadPhoto();
        await api.runProcessing();

        const response = await call({
          method: "GET",
          url: `/photos/${photo.id}/thumbnail`,
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe("GET /photos/processing", () => {
      it("says the sidecar is configured and answering", async () => {
        const view = await processing();

        expect(view.processor.enabled).toBe(true);
        expect(view.processor.url).toBe(sidecar.url);
        expect(view.processor.reachable).toBe(true);
      });

      it("says so when the sidecar is not answering", async () => {
        sidecar.respondWith(respondsWith(503));

        expect((await processing()).processor.reachable).toBe(false);
      });

      it("counts the photos in each processing state", async () => {
        await uploadPhoto();

        expect((await processing()).counts).toMatchObject({
          PENDING: 1,
          DONE: 0,
          FAILED: 0,
          SKIPPED: 0,
        });

        await api.runProcessing();

        expect((await processing()).counts).toMatchObject({ PENDING: 0, DONE: 1 });
      });

      /**
       * The question an operator actually has at 9pm: which photos gave up, and
       * why. Answering it should not require SSH and a SQL client.
       */
      it("lists what was abandoned, with the reason and the attempts spent", async () => {
        const photo = await uploadPhoto();
        sidecar.respondWith(respondsWith(415, "cannot decode this image"));

        await api.runProcessing();

        const view = await processing();
        expect(view.counts).toMatchObject({ FAILED: 1 });
        expect(view.abandoned).toHaveLength(1);
        expect(view.abandoned[0]?.photoId).toBe(photo.id);
        expect(view.abandoned[0]?.attempts).toBe(1);
        expect(view.abandoned[0]?.lastError).toMatch(/415/u);
      });

      it("needs a session, like everything else that describes the house", async () => {
        const response = await api.app.inject({
          method: "GET",
          url: "/photos/processing",
        });

        expect(response.statusCode).toBe(401);
      });

      it("is a route and not a photo id", async () => {
        const response = await call({ method: "GET", url: "/photos/processing" });

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("application/json");
      });
    });

    describe("POST /photos/:id/reprocess", () => {
      it("puts a failed photo back in the queue", async () => {
        const photo = await uploadPhoto();
        sidecar.respondWith(respondsWith(415));
        await api.runProcessing();
        expect((await processing()).counts).toMatchObject({ FAILED: 1 });

        sidecar.respondWith(respondsWithCutout(cutout));
        const response = await call({
          method: "POST",
          url: `/photos/${photo.id}/reprocess`,
        });

        expect(response.statusCode).toBe(202);
        expect((response.json() as { photo: PhotoView }).photo.processingStatus).toBe(
          PhotoProcessingStatus.PENDING,
        );

        await api.runProcessing();
        expect((await processing()).counts).toMatchObject({ DONE: 1, FAILED: 0 });
      });

      /**
       * Attempts are forgotten, not continued. A photo that already spent its
       * five attempts would otherwise be abandoned again on the very next run,
       * which would make the button look broken.
       */
      it("gives the photo its attempts back", async () => {
        const photo = await uploadPhoto();
        const dead = await anUnusedSidecarUrl();
        api.pointProcessorAt(dead);
        await api.runProcessing();
        api.clock.advanceBy(60_000 * 10);
        await api.runProcessing();
        expect((await processing()).counts).toMatchObject({ FAILED: 1 });

        await call({ method: "POST", url: `/photos/${photo.id}/reprocess` });
        api.pointProcessorAt(sidecar.url);
        await api.runProcessing();

        expect((await processing()).counts).toMatchObject({ DONE: 1 });
      });

      it("answers 404 for a photo that does not exist", async () => {
        const response = await call({
          method: "POST",
          url: "/photos/00000000-0000-4000-8000-000000000000/reprocess",
        });

        expect(response.statusCode).toBe(404);
      });

      it("needs a session", async () => {
        const photo = await uploadPhoto();

        const response = await api.app.inject({
          method: "POST",
          url: `/photos/${photo.id}/reprocess`,
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe("POST /photos/processing/retry", () => {
      it("requeues every failed photo at once", async () => {
        await uploadPhoto();
        await uploadPhoto();
        sidecar.respondWith(respondsWith(415));
        await api.runProcessing();
        expect((await processing()).counts).toMatchObject({ FAILED: 2 });

        sidecar.respondWith(respondsWithCutout(cutout));
        const response = await call({ method: "POST", url: "/photos/processing/retry" });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({ requeued: 2 });

        await api.runProcessing();
        expect((await processing()).counts).toMatchObject({ DONE: 2, FAILED: 0 });
      });

      it("answers zero when there is nothing to retry", async () => {
        const response = await call({ method: "POST", url: "/photos/processing/retry" });

        expect(response.json()).toEqual({ requeued: 0 });
      });

      it("needs a session", async () => {
        const response = await api.app.inject({
          method: "POST",
          url: "/photos/processing/retry",
        });

        expect(response.statusCode).toBe(401);
      });
    });
  });

  /**
   * The property ADR 4 exists for, stated as a test: with the sidecar switched
   * off entirely, everything a person came here to do still works.
   */
  describe("with no sidecar configured at all", () => {
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

    const uploadItemPhoto = async (): Promise<PhotoView> => {
      const unit = (
        (
          await call({
            method: "POST",
            url: "/storage-units",
            payload: { name: "Box 3", parentId: null, kind: StorageUnitKind.BOX },
          })
        ).json() as { unit: { id: string } }
      ).unit;
      const item = (
        (
          await call({
            method: "POST",
            url: "/items",
            payload: { name: "Drill", storageUnitId: unit.id },
          })
        ).json() as { item: { id: string } }
      ).item;

      const body = multipartBody({
        field: "file",
        filename: "drill.jpg",
        contentType: "image/jpeg",
        bytes: await aPlainImage("jpeg", 120, 60),
      });
      const response = await call({
        method: "POST",
        url: `/items/${item.id}/photos`,
        headers: { "content-type": body.contentType },
        payload: body.payload,
      });
      expect(response.statusCode).toBe(201);

      return (response.json() as { photo: PhotoView }).photo;
    };

    it("still registers an item with a photo", async () => {
      const photo = await uploadItemPhoto();

      expect(photo.processingStatus).toBe(PhotoProcessingStatus.PENDING);
    });

    it("still serves the photo", async () => {
      const photo = await uploadItemPhoto();

      const response = await call({ method: "GET", url: `/photos/${photo.id}` });

      expect(response.statusCode).toBe(200);
      expect(response.rawPayload.byteLength).toBeGreaterThan(0);
    });

    it("says plainly that background removal is off", async () => {
      await uploadItemPhoto();

      const view = (
        await call({ method: "GET", url: "/photos/processing" })
      ).json() as ProcessingView;

      expect(view.processor).toEqual({ enabled: false, url: null, reachable: null });
      expect(view.counts).toMatchObject({ PENDING: 1 });
    });

    /**
     * Accepted rather than refused: the photo is queued for whenever a sidecar
     * appears. A 409 here would make "switch the sidecar on later" a different
     * workflow from "it was on all along".
     */
    it("still accepts a reprocess request, and leaves the photo queued", async () => {
      const photo = await uploadItemPhoto();

      const response = await call({
        method: "POST",
        url: `/photos/${photo.id}/reprocess`,
      });

      expect(response.statusCode).toBe(202);
      expect((response.json() as { photo: PhotoView }).photo.processingStatus).toBe(
        PhotoProcessingStatus.PENDING,
      );
    });
  });

  describe("with a sidecar that is down or wedged", () => {
    let api: TestApi;
    let sidecar: StubSidecar;
    let token: string;

    beforeAll(async () => {
      sidecar = await startStubSidecar(hangs);
      api = await createTestApi({
        imageProcessor: { baseUrl: sidecar.url, timeoutMs: 2_000 },
      });
    });

    afterAll(async () => {
      await api.destroy();
      await sidecar.close();
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

    const upload = async (): Promise<LightMyRequestResponse> => {
      const unit = (
        (
          await call({
            method: "POST",
            url: "/storage-units",
            payload: { name: "Box 3", parentId: null, kind: StorageUnitKind.BOX },
          })
        ).json() as { unit: { id: string } }
      ).unit;
      const body = multipartBody({
        field: "file",
        filename: "thing.jpg",
        contentType: "image/jpeg",
        bytes: await aPlainImage("jpeg", 120, 60),
      });

      return call({
        method: "POST",
        url: `/storage-units/${unit.id}/photo`,
        headers: { "content-type": body.contentType },
        payload: body.payload,
      });
    };

    it("uploads while the sidecar is not there at all", async () => {
      api.pointProcessorAt(await anUnusedSidecarUrl());

      const response = await upload();

      expect(response.statusCode).toBe(201);
    });

    /**
     * The nastiest version of the failure, and the reason the upload path does
     * not call the processor at all: a sidecar that accepted a request and went
     * quiet holds a worker for the whole timeout. If uploading waited on that —
     * even indirectly, through a shared lock or a queue — registering an item
     * would hang for two minutes with no error anywhere.
     */
    it("uploads promptly while a background removal is hung mid-flight", async () => {
      api.pointProcessorAt(sidecar.url);
      await upload();
      const hung = api.runProcessing();

      const startedAt = Date.now();
      const response = await upload();
      const elapsed = Date.now() - startedAt;

      expect(response.statusCode).toBe(201);
      expect(elapsed).toBeLessThan(1_000);

      await hung;
    });

    it("serves the original of a photo whose processing is hung", async () => {
      api.pointProcessorAt(sidecar.url);
      const photo = (
        (await upload()).json() as { photo: PhotoView }
      ).photo;
      const hung = api.runProcessing();

      const response = await call({ method: "GET", url: `/photos/${photo.id}` });

      expect(response.statusCode).toBe(200);
      expect(response.rawPayload.byteLength).toBeGreaterThan(0);

      await hung;
    });
  });
});
