import { Role, ShareLevel, unitId } from "@waymark/domain";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ApiError, ApiErrorCode } from "./api-error.js";
import { queryKeys } from "./query-keys.js";
import {
  editableUnits,
  findTreeNode,
  rootsByWhose,
} from "./storage-unit-tree.js";
import { aStorageUnit, aTree } from "./testing/fixtures.js";
import { createWaymarkClient } from "./waymark-client.js";

/**
 * # Sharing a space, and reading what the tree says you may do (ADR 26)
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

const client = () =>
  createWaymarkClient<File>({
    baseUrl: API_URL,
    token: () => "a-live-token",
    appendPhoto: (form, field, file) => {
      form.append(field, file, file.name);
    },
  });

const bea = { id: "u2", username: "bea" };

describe("sharing a space from a client", () => {
  it("lists who a space is shared with, and at which level", async () => {
    apiServer.use(
      http.get(`${API_URL}/storage-units/garage/shares`, () =>
        HttpResponse.json({ shares: [{ account: bea, access: ShareLevel.VIEW }] }),
      ),
    );

    const { shares } = await client().shares(unitId("garage"));

    expect(shares).toEqual([{ account: bea, access: ShareLevel.VIEW }]);
  });

  it("shares it with a person at a level, by both ids in the path", async () => {
    const seen: unknown[] = [];
    apiServer.use(
      http.post(`${API_URL}/storage-units/garage/shares/u2`, async ({ request }) => {
        seen.push(await request.json());

        return HttpResponse.json({ share: { account: bea, access: ShareLevel.EDIT } });
      }),
    );

    const { share } = await client().shareSpace(unitId("garage"), "u2", ShareLevel.EDIT);

    expect(seen).toEqual([{ access: ShareLevel.EDIT }]);
    expect(share.access).toBe(ShareLevel.EDIT);
  });

  it("stops sharing it", async () => {
    let removed = false;
    apiServer.use(
      http.delete(`${API_URL}/storage-units/garage/shares/u2`, () => {
        removed = true;

        return new HttpResponse(null, { status: 204 });
      }),
    );

    await client().stopSharing(unitId("garage"), "u2");

    expect(removed).toBe(true);
  });

  it("reads a refusal to share with somebody who already has edit by its code", async () => {
    apiServer.use(
      http.post(`${API_URL}/storage-units/garage/shares/u2`, () =>
        HttpResponse.json(
          { error: { code: "ALREADY_HAS_EDIT", message: "no", details: { because: "owner" } } },
          { status: 409 },
        ),
      ),
    );

    const refusal = await client()
      .shareSpace(unitId("garage"), "u2", ShareLevel.VIEW)
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ApiError);
    expect((refusal as ApiError).code).toBe(ApiErrorCode.ALREADY_HAS_EDIT);
  });

  it("keeps each space's shares under a key of its own", () => {
    expect(queryKeys.shares(unitId("garage"))).not.toEqual(queryKeys.shares(unitId("attic")));
  });
});

describe("what the tree says you may do (ADR 26)", () => {
  const garage = aStorageUnit({ id: "garage", name: "Garage" });
  const shelf = aStorageUnit({ id: "shelf", parentId: "garage", name: "Shelf" });
  const attic = aStorageUnit({ id: "attic", name: "Attic" });
  const viewOnly = { access: ShareLevel.VIEW, mayMove: false, mayMoveToTop: false };

  const forest = [
    aTree(attic),
    aTree(garage, [aTree(shelf)], { permissions: viewOnly }),
  ];

  it("finds a node anywhere in the tree, with what you may do there", () => {
    expect(findTreeNode(forest, unitId("garage"))?.permissions.access).toBe(ShareLevel.VIEW);
    expect(findTreeNode(forest, unitId("shelf"))?.permissions.access).toBe(ShareLevel.EDIT);
    expect(findTreeNode(forest, unitId("nowhere"))).toBeNull();
  });

  it("offers as places to put things only the spaces you may edit", () => {
    expect(editableUnits(forest).map((entry) => entry.unit.name)).toEqual(["Attic", "Shelf"]);
  });
});

describe("whose each root is, for the home screen (ADR 26)", () => {
  const me = { id: "u1", username: "dario" };
  const office = aStorageUnit({ id: "office", name: "Office" });
  const house = aStorageUnit({ id: "house", name: "House" });
  const flat = aStorageUnit({ id: "flat", name: "Flat" });
  const garage = aStorageUnit({ id: "garage", name: "Garage" });

  it("puts an administrator's own roots first, then each other person's under their name", () => {
    const groups = rootsByWhose(
      [
        aTree(flat, [], { owner: { id: "u3", username: "bea" } }),
        aTree(house, [], { owner: { id: "u2", username: "ana" } }),
        aTree(office, [], { owner: me }),
      ],
      { id: me.id, role: Role.ADMINISTRATOR },
    );

    expect(groups.yours.map((root) => root.name)).toEqual(["Office"]);
    expect(groups.sharedWithYou).toEqual([]);
    expect(
      groups.others.map((group) => [group.owner.username, group.roots.map((root) => root.name)]),
    ).toEqual([
      ["ana", ["House"]],
      ["bea", ["Flat"]],
    ]);
  });

  it("puts a person's own roots first, then what was shared with them", () => {
    const groups = rootsByWhose(
      [aTree(flat), aTree(garage, [], { shared: true })],
      { id: "u3", role: Role.USER },
    );

    expect(groups.yours.map((root) => root.name)).toEqual(["Flat"]);
    expect(groups.sharedWithYou.map((root) => root.name)).toEqual(["Garage"]);
    expect(groups.others).toEqual([]);
  });

  it("never groups a person's roots under anybody's name, whatever a tree carried", () => {
    const groups = rootsByWhose(
      [aTree(house, [], { owner: { id: "u2", username: "ana" }, shared: true })],
      { id: "u3", role: Role.USER },
    );

    expect(groups.others).toEqual([]);
    expect(groups.sharedWithYou.map((root) => root.name)).toEqual(["House"]);
  });
});
