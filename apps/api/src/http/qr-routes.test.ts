import { StorageUnitKind } from "@ariadna/domain";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { decodeQrPng, decodeQrSvg } from "../qr/testing/decode-qr.js";
import {
  TEST_PASSWORD,
  TEST_PUBLIC_BASE_URL,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

interface UnitView {
  readonly id: string;
  readonly publicId: string;
}

describe("storage unit QR codes over HTTP", () => {
  let api: TestApi;
  let token: string;
  let unit: UnitView;

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

    const created = await call({
      method: "POST",
      url: "/storage-units",
      payload: { name: "Box 3", parentId: null, kind: StorageUnitKind.BOX },
    });
    unit = (created.json() as { unit: UnitView }).unit;
  });

  const call = async (options: InjectOptions): Promise<LightMyRequestResponse> =>
    api.app.inject({
      ...options,
      headers: { ...options.headers, ...api.authHeaders(token) },
    });

  const expectedUrl = (): string => `${TEST_PUBLIC_BASE_URL}/u/${unit.publicId}`;

  describe("a QR is not public", () => {
    it.each([
      ["PNG", "qr.png"],
      ["SVG", "qr.svg"],
    ])("refuses the %s without a session", async (_format, suffix) => {
      const response = await api.app.inject({
        method: "GET",
        url: `/storage-units/${unit.id}/${suffix}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("PNG", () => {
    it("decodes back to the unit page URL, not to a bare id", async () => {
      const response = await call({
        method: "GET",
        url: `/storage-units/${unit.id}/qr.png`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/png");

      const decoded = await decodeQrPng(response.rawPayload);

      expect(decoded).toBe(expectedUrl());
      // The whole reason for encoding a URL: the id alone would make a phone
      // camera offer "copy text" instead of "open page".
      expect(decoded).not.toBe(unit.publicId);
    });

    it("404s for a unit that is not there", async () => {
      const response = await call({
        method: "GET",
        url: "/storage-units/nope/qr.png",
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as { error: { code: string } }).error.code).toBe(
        "STORAGE_UNIT_NOT_FOUND",
      );
    });
  });

  describe("SVG", () => {
    it("decodes back to the unit page URL", async () => {
      const response = await call({
        method: "GET",
        url: `/storage-units/${unit.id}/qr.svg`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("image/svg+xml; charset=utf-8");
      await expect(decodeQrSvg(response.body)).resolves.toBe(expectedUrl());
    });

    it("404s for a unit that is not there", async () => {
      const response = await call({
        method: "GET",
        url: "/storage-units/nope/qr.svg",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("caching", () => {
    it("lets a client revalidate instead of re-downloading", async () => {
      const first = await call({
        method: "GET",
        url: `/storage-units/${unit.id}/qr.png`,
      });

      const etag = first.headers.etag;
      expect(etag).toBeDefined();
      expect(first.headers["cache-control"]).toContain("private");

      const second = await call({
        method: "GET",
        url: `/storage-units/${unit.id}/qr.png`,
        headers: { "if-none-match": String(etag) },
      });

      expect(second.statusCode).toBe(304);
      expect(second.rawPayload.length).toBe(0);
    });

    it("gives two units two different tags", async () => {
      const other = await call({
        method: "POST",
        url: "/storage-units",
        payload: { name: "Box 4", parentId: null, kind: StorageUnitKind.BOX },
      });
      const otherUnit = (other.json() as { unit: UnitView }).unit;

      const [mine, theirs] = await Promise.all([
        call({ method: "GET", url: `/storage-units/${unit.id}/qr.png` }),
        call({ method: "GET", url: `/storage-units/${otherUnit.id}/qr.png` }),
      ]);

      expect(mine.headers.etag).not.toBe(theirs.headers.etag);
    });
  });
});
