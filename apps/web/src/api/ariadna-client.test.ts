import { itemId, unitId } from "@ariadna/domain";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { apiServer, API_URL } from "../testing/api-server.js";
import { aStorageUnit } from "../testing/fixtures.js";
import { ApiError, FailureKind, failureKindOf } from "./api-error.js";
import { createAriadnaClient } from "./ariadna-client.js";

const clientWith = (
  overrides: Partial<Parameters<typeof createAriadnaClient>[0]> = {},
) =>
  createAriadnaClient({
    baseUrl: API_URL,
    token: () => "a-live-token",
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
});
