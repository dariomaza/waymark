import { itemId, photoId, PhotoProcessingStatus, unitId } from "@waymark/domain";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiError, FailureKind, failureKindOf } from "./api-error.js";
import { createWaymarkClient, PHOTO_FIELD_NAME } from "./waymark-client.js";
import { anItem, aPhoto, aStorageUnit } from "./testing/fixtures.js";

/**
 * The network is stubbed at the HTTP boundary and nowhere else.
 *
 * This is the client's own contract suite: it runs the real `fetch`, the real
 * error envelope reading and the real URL building against MSW answering the
 * way `apps/api` does. Both clients share this file's subject, so a change
 * that would break the Android app breaks here first.
 */
const API_URL = "http://127.0.0.1:3000";

const apiServer = setupServer();

beforeAll(() => {
  apiServer.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  apiServer.resetHandlers();
});
afterAll(() => {
  apiServer.close();
});

/** What a browser hands over: a `File`, appended with its own name. */
const clientWith = (
  overrides: Partial<Parameters<typeof createWaymarkClient<File>>[0]> = {},
) =>
  createWaymarkClient<File>({
    baseUrl: API_URL,
    token: () => "a-live-token",
    appendPhoto: (form, field, file) => {
      form.append(field, file, file.name);
    },
    ...overrides,
  });

describe("the Ariadna API client", () => {
  it("presents the session as a bearer token", async () => {
    const seen: (string | null)[] = [];
    apiServer.use(
      http.get(`${API_URL}/auth/me`, ({ request }) => {
        seen.push(request.headers.get("authorization"));
        return HttpResponse.json({ user: { id: "u1", username: "dario" } });
      }),
    );

    const { user } = await clientWith().me();

    expect(seen).toEqual(["Bearer a-live-token"]);
    expect(user.username).toBe("dario");
  });

  it("sends no authorization header at all when there is no session", async () => {
    const seen: (string | null)[] = [];
    apiServer.use(
      http.post(`${API_URL}/auth/login`, ({ request }) => {
        seen.push(request.headers.get("authorization"));
        return HttpResponse.json({
          token: "fresh",
          expiresAt: "2026-10-20T00:00:00.000Z",
          user: { id: "u1", username: "dario" },
        });
      }),
    );

    const result = await clientWith({ token: () => null }).login({
      username: "dario",
      password: "correct horse",
    });

    expect(seen).toEqual([null]);
    expect(result.token).toBe("fresh");
  });

  it("reads a 204 as a completed call with nothing in it", async () => {
    apiServer.use(
      http.delete(`${API_URL}/storage-units/u1`, () => new HttpResponse(null, { status: 204 })),
    );

    await expect(clientWith().deleteUnit(unitId("u1"))).resolves.toBeUndefined();
  });

  it("turns the API's error envelope into an ApiError that keeps its details", async () => {
    apiServer.use(
      http.delete(`${API_URL}/storage-units/u1`, () =>
        HttpResponse.json(
          {
            error: {
              code: "STORAGE_UNIT_NOT_EMPTY",
              message: "storage unit u1 still holds 3 items and 1 child unit",
              details: { storageUnitId: "u1", itemCount: 3, childUnitCount: 1 },
            },
          },
          { status: 409 },
        ),
      ),
    );

    const error = await clientWith()
      .deleteUnit(unitId("u1"))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "STORAGE_UNIT_NOT_EMPTY",
      details: { itemCount: 3, childUnitCount: 1 },
    });
  });

  it("tells a refusal about the world apart from a refusal about the request", async () => {
    expect(failureKindOf(new ApiError(409, "STORAGE_UNIT_NOT_EMPTY", "full"))).toBe(
      FailureKind.CONFLICT,
    );
    expect(failureKindOf(new ApiError(422, "INVALID_QUANTITY", "nope"))).toBe(
      FailureKind.INVALID,
    );
    expect(failureKindOf(new ApiError(404, "STORAGE_UNIT_NOT_FOUND", "gone"))).toBe(
      FailureKind.NOT_FOUND,
    );
    expect(failureKindOf(new ApiError(500, "INTERNAL_ERROR", "boom"))).toBe(
      FailureKind.SERVER,
    );
  });

  it("reports a dead connection as being offline rather than as a crash", async () => {
    apiServer.use(http.get(`${API_URL}/storage-units`, () => HttpResponse.error()));

    const error = await clientWith()
      .tree()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(failureKindOf(error)).toBe(FailureKind.OFFLINE);
  });

  it("hands a 401 to whoever owns the session, once, before failing the call", async () => {
    const onUnauthorized = vi.fn();
    apiServer.use(
      http.get(`${API_URL}/storage-units`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_SESSION", message: "session has expired" } },
          { status: 401 },
        ),
      ),
    );

    await expect(clientWith({ onUnauthorized }).tree()).rejects.toBeInstanceOf(ApiError);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not end a session when it was a password that was refused", async () => {
    const onUnauthorized = vi.fn();
    apiServer.use(
      http.post(`${API_URL}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: "INVALID_CREDENTIALS", message: "wrong" } },
          { status: 401 },
        ),
      ),
    );

    await expect(
      clientWith({ token: () => null, onUnauthorized }).login({
        username: "dario",
        password: "guess",
      }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("edits a unit with a PATCH carrying only what it was given", async () => {
    const seen: { method: string; body: unknown }[] = [];
    apiServer.use(
      http.patch(`${API_URL}/storage-units/u1`, async ({ request }) => {
        seen.push({ method: request.method, body: await request.json() });

        return HttpResponse.json({ unit: aStorageUnit({ id: "u1", name: "Box 4" }) });
      }),
    );

    const { unit } = await clientWith().updateUnit(unitId("u1"), { name: "Box 4" });

    expect(seen).toEqual([{ method: "PATCH", body: { name: "Box 4" } }]);
    expect(unit.name).toBe("Box 4");
  });

  it("edits an item with a PATCH, tags and all", async () => {
    const seen: unknown[] = [];
    apiServer.use(
      http.patch(`${API_URL}/items/i1`, async ({ request }) => {
        seen.push(await request.json());

        return HttpResponse.json({ item: anItem({ id: "i1", tags: ["cables"] }) });
      }),
    );

    await clientWith().updateItem(itemId("i1"), { tags: ["cables"] });

    expect(seen).toEqual([{ tags: ["cables"] }]);
  });

  it("asks once for every item, and takes the location from the answer", async () => {
    const asked: string[] = [];
    const garage = aStorageUnit({ id: "garage", name: "Garage" });
    apiServer.use(
      http.get(`${API_URL}/items`, ({ request }) => {
        asked.push(new URL(request.url).pathname);

        return HttpResponse.json({
          items: [{ item: anItem({ id: "i1" }), path: [garage], location: "Garage" }],
        });
      }),
    );

    const { items } = await clientWith().items();

    expect(asked).toEqual(["/items"]);
    expect(items[0]?.location).toBe("Garage");
  });

  it("asks for a search the way the route documents it", async () => {
    const seen: string[] = [];
    apiServer.use(
      http.get(`${API_URL}/search`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ query: "cab", terms: ["cab"], items: [], storageUnits: [] });
      }),
    );

    await clientWith().search({ query: "cab", within: unitId("u1"), limit: 20 });

    expect(seen).toEqual(["?q=cab&within=u1&limit=20"]);
  });

  it("leaves out a scope and a limit nobody asked for", async () => {
    const seen: string[] = [];
    apiServer.use(
      http.get(`${API_URL}/search`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ query: "cab", terms: ["cab"], items: [], storageUnits: [] });
      }),
    );

    await clientWith().search({ query: "cab" });

    expect(seen).toEqual(["?q=cab"]);
  });

  it("uploads a photo as multipart under the field name the API reads", async () => {
    const seen: { name: string | undefined; type: string | undefined }[] = [];
    apiServer.use(
      http.post(`${API_URL}/items/i1/photos`, async ({ request }) => {
        const form = await request.formData();
        const file = form.get("file");
        seen.push({
          name: file instanceof File ? file.name : undefined,
          type: file instanceof File ? file.type : undefined,
        });
        return HttpResponse.json(
          {
            photo: {
              id: "p1",
              processingStatus: "PENDING",
              url: "/photos/p1",
              thumbnailUrl: "/photos/p1/thumbnail",
            },
            item: { id: "i1" },
          },
          { status: 201 },
        );
      }),
    );

    await clientWith().uploadItemPhoto(
      itemId("i1"),
      new File(["bytes"], "drill.jpg", { type: "image/jpeg" }),
    );

    expect(seen).toEqual([{ name: "drill.jpg", type: "image/jpeg" }]);
  });

  /**
   * The one place the two platforms genuinely differ.
   *
   * A browser has a `File`; React Native has a local `file://` URI and no way
   * to turn it into one without reading a whole photo into memory. So the
   * client asks its caller to put the part in, and pins here that it asks with
   * the field name the API reads and does not touch it afterwards.
   */
  it("lets the platform decide what the file part of an upload IS", async () => {
    const appended: { field: string; part: unknown }[] = [];
    apiServer.use(
      http.post(`${API_URL}/storage-units/u1/photo`, () =>
        HttpResponse.json(
          {
            photo: {
              id: "p1",
              processingStatus: "PENDING",
              url: "/photos/p1",
              thumbnailUrl: "/photos/p1/thumbnail",
            },
            unit: aStorageUnit({ id: "u1" }),
            releasedPhotoIds: [],
          },
          { status: 201 },
        ),
      ),
    );

    const nativeAsset = { uri: "file:///tmp/box.jpg", name: "box.jpg", type: "image/jpeg" };
    const client = createWaymarkClient<typeof nativeAsset>({
      baseUrl: API_URL,
      token: () => "a-live-token",
      appendPhoto: (form, field, asset) => {
        appended.push({ field, part: asset });
        form.append(field, new File(["bytes"], asset.name, { type: asset.type }));
      },
    });

    await client.uploadUnitPhoto(unitId("u1"), nativeAsset);

    expect(appended).toEqual([{ field: PHOTO_FIELD_NAME, part: nativeAsset }]);
    expect(PHOTO_FIELD_NAME).toBe("file");
  });

  it("fetches an image by the URL the API handed out, never one it built", async () => {
    apiServer.use(
      http.get(`${API_URL}/photos/p1/thumbnail`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, {
          headers: { "content-type": "image/jpeg" },
        }),
      ),
    );

    const blob = await clientWith().fetchImage("/photos/p1/thumbnail");

    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBe(3);
  });

  /**
   * A React Native `<Image>` carries its own `Authorization` header rather
   * than an object URL, so it needs the absolute address of a path the API
   * handed out. It is the same address `fetchImage` would have asked for.
   */
  it("spells out the absolute address of a path the API handed out", () => {
    expect(clientWith().absoluteUrl("/photos/p1/thumbnail")).toBe(
      `${API_URL}/photos/p1/thumbnail`,
    );
    expect(clientWith().qrPngUrl(unitId("u1"))).toBe(`${API_URL}/storage-units/u1/qr.png`);
  });

  it("reads the whole forest of storage units", async () => {
    const garage = aStorageUnit({ id: "garage", name: "Garage" });
    apiServer.use(
      http.get(`${API_URL}/storage-units`, () =>
        HttpResponse.json({ tree: [{ ...garage, children: [] }] }),
      ),
    );

    const { tree } = await clientWith().tree();

    expect(tree.map((node) => node.name)).toEqual(["Garage"]);
  });

  /**
   * # Putting a photo back in the queue
   *
   * ADR 4 named the gap and ADR 10 filled it on the API side: a `FAILED`
   * photo stays unprocessed for ever unless something asks again. Both
   * routes answer `202` — queued, not done — because waiting for a removal
   * on a request is the one thing that whole design exists to prevent.
   */
  describe("asking for a background removal again", () => {
    it("reprocesses one photo and hands back what it is now", async () => {
      const asked: string[] = [];
      apiServer.use(
        http.post(`${API_URL}/photos/p1/reprocess`, ({ request }) => {
          asked.push(request.url);

          return HttpResponse.json(
            { photo: aPhoto({ id: "p1", processingStatus: PhotoProcessingStatus.PENDING }) },
            { status: 202 },
          );
        }),
      );

      const { photo } = await clientWith().reprocessPhoto(photoId("p1"));

      expect(asked).toEqual([`${API_URL}/photos/p1/reprocess`]);
      // Back to PENDING: the answer says it is queued, never that it worked.
      expect(photo.processingStatus).toBe(PhotoProcessingStatus.PENDING);
    });

    it("escapes a photo id rather than pasting it into the path", async () => {
      const asked: string[] = [];
      apiServer.use(
        http.post(`${API_URL}/photos/:id/reprocess`, ({ request }) => {
          asked.push(new URL(request.url).pathname);

          return HttpResponse.json({ photo: aPhoto({ id: "odd" }) }, { status: 202 });
        }),
      );

      await clientWith().reprocessPhoto(photoId("a/b"));

      expect(asked).toEqual(["/photos/a%2Fb/reprocess"]);
    });

    it("retries every failed photo and says how many were requeued", async () => {
      apiServer.use(
        http.post(`${API_URL}/photos/processing/retry`, () =>
          HttpResponse.json({ requeued: 7 }, { status: 202 }),
        ),
      );

      await expect(clientWith().retryFailedPhotos()).resolves.toEqual({ requeued: 7 });
    });

    it("reads what background removal is doing, including switched off", async () => {
      apiServer.use(
        http.get(`${API_URL}/photos/processing`, () =>
          HttpResponse.json({
            processor: { enabled: false, url: null, reachable: null },
            counts: { PENDING: 0, DONE: 0, FAILED: 2, SKIPPED: 0 },
            abandoned: [
              {
                photoId: "p1",
                attempts: 5,
                lastError: "415 cannot decode this image",
                lastAttemptAt: "2026-09-21T10:00:00.000Z",
                url: "/photos/p1",
              },
            ],
          }),
        ),
      );

      const status = await clientWith().photoProcessing();

      expect(status.processor.enabled).toBe(false);
      expect(status.counts.FAILED).toBe(2);
      expect(status.abandoned[0]?.lastError).toMatch(/415/u);
    });
  });
});
