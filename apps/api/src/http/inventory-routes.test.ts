import { StorageUnitKind } from "@waymark/domain";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestApi,
  type TestApi,
} from "./testing/test-api.js";

interface UnitView {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly kind: string;
  readonly publicId: string;
}

interface ItemView {
  readonly id: string;
  readonly storageUnitId: string;
  readonly name: string;
  readonly quantity: number;
  readonly tags: readonly string[];
}

const errorCodeOf = (response: LightMyRequestResponse): string =>
  (response.json() as { error: { code: string } }).error.code;

describe("inventory over HTTP", () => {
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
    api.app.inject({ ...options, headers: { ...options.headers, ...api.authHeaders(token) } });

  const createUnit = async (
    name: string,
    parentId: string | null = null,
    kind: string = StorageUnitKind.BOX,
  ): Promise<UnitView> => {
    const response = await call({
      method: "POST",
      url: "/storage-units",
      payload: { name, parentId, kind },
    });

    expect(response.statusCode).toBe(201);

    return (response.json() as { unit: UnitView }).unit;
  };

  const createItem = async (
    name: string,
    storageUnitId: string,
    extra: Record<string, unknown> = {},
  ): Promise<ItemView> => {
    const response = await call({
      method: "POST",
      url: "/items",
      payload: { name, storageUnitId, ...extra },
    });

    expect(response.statusCode).toBe(201);

    return (response.json() as { item: ItemView }).item;
  };

  describe("every inventory route needs a session", () => {
    it.each([
      ["GET", "/storage-units"],
      ["POST", "/storage-units"],
      ["GET", "/storage-units/any-id"],
      ["DELETE", "/storage-units/any-id"],
      ["POST", "/storage-units/any-id/move"],
      ["POST", "/storage-units/any-id/empty"],
      ["PATCH", "/storage-units/any-id"],
      ["GET", "/items"],
      ["GET", "/items/any-id"],
      ["POST", "/items"],
      ["PATCH", "/items/any-id"],
      ["DELETE", "/items/any-id"],
      ["POST", "/items/move"],
    ])("answers 401 for an anonymous %s %s", async (method, url) => {
      const response = await api.app.inject({
        method: method as "GET",
        url,
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });

    it("answers 401 for a revoked token, even on a route that would have worked", async () => {
      await call({ method: "POST", url: "/auth/logout" });

      const response = await call({ method: "GET", url: "/storage-units" });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /storage-units", () => {
    it("creates a root unit and says where it lives", async () => {
      const response = await call({
        method: "POST",
        url: "/storage-units",
        payload: { name: "Storage room", kind: StorageUnitKind.ROOM },
      });

      expect(response.statusCode).toBe(201);
      const { unit } = response.json() as { unit: UnitView };
      expect(unit).toMatchObject({ name: "Storage room", parentId: null });
      expect(response.headers["location"]).toBe(`/storage-units/${unit.id}`);
    });

    it("generates the public id that will go under the QR code", async () => {
      const unit = await createUnit("Box 3");

      expect(unit.publicId).toMatch(/^[0-9A-Z]{10}$/u);
    });

    it("nests a unit under an existing parent", async () => {
      const room = await createUnit("Storage room", null, StorageUnitKind.ROOM);

      const box = await createUnit("Box 3", room.id);

      expect(box.parentId).toBe(room.id);
    });

    it("answers 422 for a parent nobody created", async () => {
      const response = await call({
        method: "POST",
        url: "/storage-units",
        payload: { name: "Box", kind: StorageUnitKind.BOX, parentId: "ghost" },
      });

      expect(response.statusCode).toBe(422);
      expect(errorCodeOf(response)).toBe("STORAGE_UNIT_NOT_FOUND");
    });

    describe("input validation", () => {
      it("answers 400 for a missing name", async () => {
        const response = await call({
          method: "POST",
          url: "/storage-units",
          payload: { kind: StorageUnitKind.BOX },
        });

        expect(response.statusCode).toBe(400);
        expect(errorCodeOf(response)).toBe("VALIDATION_FAILED");
      });

      it("answers 400 for a kind the domain does not have", async () => {
        const response = await call({
          method: "POST",
          url: "/storage-units",
          payload: { name: "Box", kind: "TARDIS" },
        });

        expect(response.statusCode).toBe(400);
      });

      it("answers 400 for a field nobody asked for", async () => {
        const response = await call({
          method: "POST",
          url: "/storage-units",
          payload: { name: "Box", kind: StorageUnitKind.BOX, ownerId: "me" },
        });

        // One shared inventory: there is no owner column, and a request that
        // thinks there is should be told so rather than quietly ignored.
        expect(response.statusCode).toBe(400);
      });

      it("answers 400 for a body that is not JSON", async () => {
        const response = await call({
          method: "POST",
          url: "/storage-units",
          headers: { "content-type": "application/json" },
          payload: "{not json",
        });

        expect(response.statusCode).toBe(400);
      });

      it("says which field was wrong", async () => {
        const response = await call({
          method: "POST",
          url: "/storage-units",
          payload: { kind: StorageUnitKind.BOX },
        });

        const body = response.json() as {
          error: { details: { issues: { path: string }[] } };
        };
        expect(body.error.details.issues[0]?.path).toBe("name");
      });
    });
  });

  describe("GET /storage-units", () => {
    it("returns an empty forest for an empty house", async () => {
      const response = await call({ method: "GET", url: "/storage-units" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ tree: [] });
    });

    it("returns the whole tree, nested", async () => {
      const room = await createUnit("Storage room", null, StorageUnitKind.ROOM);
      const wardrobe = await createUnit("Metal wardrobe", room.id, StorageUnitKind.FURNITURE);
      await createUnit("Box 3", wardrobe.id);

      const response = await call({ method: "GET", url: "/storage-units" });

      const { tree } = response.json() as {
        tree: { name: string; children: { name: string; children: unknown[] }[] }[];
      };
      expect(tree).toHaveLength(1);
      expect(tree[0]?.name).toBe("Storage room");
      expect(tree[0]?.children[0]?.name).toBe("Metal wardrobe");
      expect(tree[0]?.children[0]?.children).toHaveLength(1);
    });

    it("lists several roots, because a house has a garage and an attic", async () => {
      await createUnit("Attic", null, StorageUnitKind.ROOM);
      await createUnit("Garage", null, StorageUnitKind.ROOM);

      const response = await call({ method: "GET", url: "/storage-units" });

      const { tree } = response.json() as { tree: { name: string }[] };
      expect(tree.map((node) => node.name)).toEqual(["Attic", "Garage"]);
    });
  });

  describe("GET /storage-units/:id", () => {
    it("returns the unit, its path, its children and its items", async () => {
      const room = await createUnit("Storage room", null, StorageUnitKind.ROOM);
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      const box = await createUnit("Box 3", wardrobe.id);
      await createItem("Ski boots", wardrobe.id);

      const response = await call({
        method: "GET",
        url: `/storage-units/${wardrobe.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        unit: UnitView;
        path: UnitView[];
        children: UnitView[];
        items: ItemView[];
      };
      expect(body.unit.id).toBe(wardrobe.id);
      expect(body.path.map((unit) => unit.name)).toEqual([
        "Storage room",
        "Metal wardrobe",
      ]);
      expect(body.children.map((unit) => unit.id)).toEqual([box.id]);
      expect(body.items.map((item) => item.name)).toEqual(["Ski boots"]);
    });

    it("gives a root a path of exactly itself, because location IS the path (ADR 1)", async () => {
      const room = await createUnit("Storage room", null, StorageUnitKind.ROOM);

      const response = await call({ method: "GET", url: `/storage-units/${room.id}` });

      const { path } = response.json() as { path: UnitView[] };
      expect(path.map((unit) => unit.name)).toEqual(["Storage room"]);
    });

    it("answers 404 for a unit nobody created", async () => {
      const response = await call({ method: "GET", url: "/storage-units/ghost" });

      expect(response.statusCode).toBe(404);
      expect(errorCodeOf(response)).toBe("STORAGE_UNIT_NOT_FOUND");
    });
  });

  describe("POST /storage-units/:id/move", () => {
    it("moves a unit under a new parent", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const attic = await createUnit("Attic", null, StorageUnitKind.ROOM);
      const box = await createUnit("Box 3", garage.id);

      const response = await call({
        method: "POST",
        url: `/storage-units/${box.id}/move`,
        payload: { parentId: attic.id },
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as { unit: UnitView }).unit.parentId).toBe(attic.id);
    });

    it("takes the whole subtree with it, implicitly", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const attic = await createUnit("Attic", null, StorageUnitKind.ROOM);
      const wardrobe = await createUnit("Wardrobe", garage.id);
      const box = await createUnit("Box 3", wardrobe.id);

      await call({
        method: "POST",
        url: `/storage-units/${wardrobe.id}/move`,
        payload: { parentId: attic.id },
      });

      const response = await call({ method: "GET", url: `/storage-units/${box.id}` });
      const { path } = response.json() as { path: UnitView[] };
      expect(path.map((unit) => unit.name)).toEqual(["Attic", "Wardrobe", "Box 3"]);
    });

    it("makes a unit a root when the parent is null", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const box = await createUnit("Box 3", garage.id);

      const response = await call({
        method: "POST",
        url: `/storage-units/${box.id}/move`,
        payload: { parentId: null },
      });

      expect((response.json() as { unit: UnitView }).unit.parentId).toBeNull();
    });

    it("answers 409 for moving a unit into itself", async () => {
      const box = await createUnit("Box 3");

      const response = await call({
        method: "POST",
        url: `/storage-units/${box.id}/move`,
        payload: { parentId: box.id },
      });

      expect(response.statusCode).toBe(409);
      expect(errorCodeOf(response)).toBe("CYCLIC_STORAGE_UNIT_MOVE");
    });

    it("answers 409 for the three node cycle of ADR 2, and never a 500", async () => {
      // Storage room > Metal wardrobe > Box, then Storage room INTO Box. No
      // unit is its own parent, so a `parentId !== id` guard would let this
      // through and silently detach all three from every root.
      const room = await createUnit("Storage room", null, StorageUnitKind.ROOM);
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      const box = await createUnit("Box 3", wardrobe.id);

      const response = await call({
        method: "POST",
        url: `/storage-units/${room.id}/move`,
        payload: { parentId: box.id },
      });

      expect(response.statusCode).toBe(409);
      expect(errorCodeOf(response)).toBe("CYCLIC_STORAGE_UNIT_MOVE");
      expect(response.json()).toMatchObject({
        error: { details: { storageUnitId: room.id, targetParentId: box.id } },
      });
    });

    it("leaves the tree untouched after a refused move", async () => {
      const room = await createUnit("Storage room", null, StorageUnitKind.ROOM);
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      const box = await createUnit("Box 3", wardrobe.id);

      await call({
        method: "POST",
        url: `/storage-units/${room.id}/move`,
        payload: { parentId: box.id },
      });

      const response = await call({ method: "GET", url: `/storage-units/${box.id}` });
      const { path } = response.json() as { path: UnitView[] };
      expect(path.map((unit) => unit.name)).toEqual([
        "Storage room",
        "Metal wardrobe",
        "Box 3",
      ]);
    });

    it("answers 404 when the unit being moved does not exist", async () => {
      const response = await call({
        method: "POST",
        url: "/storage-units/ghost/move",
        payload: { parentId: null },
      });

      expect(response.statusCode).toBe(404);
    });

    it("answers 422 when the target parent does not exist", async () => {
      const box = await createUnit("Box 3");

      const response = await call({
        method: "POST",
        url: `/storage-units/${box.id}/move`,
        payload: { parentId: "ghost" },
      });

      expect(response.statusCode).toBe(422);
      expect(errorCodeOf(response)).toBe("STORAGE_UNIT_NOT_FOUND");
    });

    it("answers 400 when parentId is missing entirely", async () => {
      const box = await createUnit("Box 3");

      const response = await call({
        method: "POST",
        url: `/storage-units/${box.id}/move`,
        payload: {},
      });

      // Absent is not the same as `null`: one is a forgotten field, the other
      // is "make it a root".
      expect(response.statusCode).toBe(400);
    });
  });

  describe("PATCH /storage-units/:id", () => {
    it("renames a unit and answers with the new one", async () => {
      const box = await createUnit("Box 3");

      const response = await call({
        method: "PATCH",
        url: `/storage-units/${box.id}`,
        payload: { name: "Box 4" },
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as { unit: UnitView }).unit.name).toBe("Box 4");
    });

    it("stores the new name, so the next read sees it", async () => {
      const box = await createUnit("Box 3");

      await call({
        method: "PATCH",
        url: `/storage-units/${box.id}`,
        payload: { name: "Box 4" },
      });

      const after = await call({ method: "GET", url: `/storage-units/${box.id}` });
      expect((after.json() as { unit: UnitView }).unit.name).toBe("Box 4");
    });

    it("keeps the publicId, because the label is already on the box", async () => {
      const box = await createUnit("Box 3");

      const response = await call({
        method: "PATCH",
        url: `/storage-units/${box.id}`,
        payload: { name: "Box 4" },
      });

      expect((response.json() as { unit: UnitView }).unit.publicId).toBe(box.publicId);
    });

    it("changes the kind and the description in one request", async () => {
      const box = await createUnit("Box 3");

      const response = await call({
        method: "PATCH",
        url: `/storage-units/${box.id}`,
        payload: { kind: StorageUnitKind.BAG, description: "Winter clothes" },
      });

      const { unit } = response.json() as {
        unit: UnitView & { description: string | null };
      };
      expect(unit.kind).toBe(StorageUnitKind.BAG);
      expect(unit.description).toBe("Winter clothes");
      expect(unit.name).toBe("Box 3");
    });

    it("clears a description with an explicit null", async () => {
      const box = await createUnit("Box 3");
      await call({
        method: "PATCH",
        url: `/storage-units/${box.id}`,
        payload: { description: "Cables, mostly" },
      });

      const response = await call({
        method: "PATCH",
        url: `/storage-units/${box.id}`,
        payload: { description: null },
      });

      expect(
        (response.json() as { unit: { description: string | null } }).unit.description,
      ).toBeNull();
    });

    it("answers 404 for a unit nobody created", async () => {
      const response = await call({
        method: "PATCH",
        url: "/storage-units/ghost",
        payload: { name: "Box 4" },
      });

      expect(response.statusCode).toBe(404);
      expect(errorCodeOf(response)).toBe("STORAGE_UNIT_NOT_FOUND");
    });

    describe("it cannot move anything", () => {
      it("refuses a parentId rather than ignoring it", async () => {
        const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
        const box = await createUnit("Box 3", garage.id);

        const response = await call({
          method: "PATCH",
          url: `/storage-units/${box.id}`,
          payload: { name: "Box 4", parentId: null },
        });

        // Loudly, and naming the key: silently dropping it would let a client
        // believe it had moved a box out of a room (ADR 2).
        expect(response.statusCode).toBe(400);
        expect(errorCodeOf(response)).toBe("VALIDATION_FAILED");
        expect(response.body).toContain("parentId");
      });

      it("leaves the unit under the parent it had", async () => {
        const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
        const box = await createUnit("Box 3", garage.id);

        const response = await call({
          method: "PATCH",
          url: `/storage-units/${box.id}`,
          payload: { name: "Box 4" },
        });

        expect((response.json() as { unit: UnitView }).unit.parentId).toBe(garage.id);
      });
    });

    describe("input validation", () => {
      it("refuses a request that names nothing to change", async () => {
        const box = await createUnit("Box 3");

        const response = await call({
          method: "PATCH",
          url: `/storage-units/${box.id}`,
          payload: {},
        });

        expect(response.statusCode).toBe(400);
        expect(errorCodeOf(response)).toBe("VALIDATION_FAILED");
      });

      it("refuses an empty name", async () => {
        const box = await createUnit("Box 3");

        const response = await call({
          method: "PATCH",
          url: `/storage-units/${box.id}`,
          payload: { name: "   " },
        });

        expect(response.statusCode).toBe(400);
      });

      it("refuses a kind the domain has never heard of", async () => {
        const box = await createUnit("Box 3");

        const response = await call({
          method: "PATCH",
          url: `/storage-units/${box.id}`,
          payload: { kind: "SHOEBOX" },
        });

        expect(response.statusCode).toBe(400);
      });

      it("refuses a photoId, which is the upload route's business", async () => {
        const box = await createUnit("Box 3");

        const response = await call({
          method: "PATCH",
          url: `/storage-units/${box.id}`,
          payload: { photoId: "photo-1" },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe("DELETE /storage-units/:id", () => {
    it("deletes an empty unit", async () => {
      const box = await createUnit("Box 3");

      const response = await call({
        method: "DELETE",
        url: `/storage-units/${box.id}`,
      });

      expect(response.statusCode).toBe(204);
      const after = await call({ method: "GET", url: `/storage-units/${box.id}` });
      expect(after.statusCode).toBe(404);
    });

    it("answers 409 for a unit that still holds an item (ADR 3)", async () => {
      const box = await createUnit("Box 3");
      await createItem("Ski boots", box.id);

      const response = await call({
        method: "DELETE",
        url: `/storage-units/${box.id}`,
      });

      expect(response.statusCode).toBe(409);
      expect(errorCodeOf(response)).toBe("STORAGE_UNIT_NOT_EMPTY");
    });

    it("answers 409 for a unit that still holds a child unit", async () => {
      const wardrobe = await createUnit("Metal wardrobe");
      await createUnit("Box 3", wardrobe.id);

      const response = await call({
        method: "DELETE",
        url: `/storage-units/${wardrobe.id}`,
      });

      expect(response.statusCode).toBe(409);
    });

    it("says how much is inside, so the UI can offer to empty it", async () => {
      const wardrobe = await createUnit("Metal wardrobe");
      await createUnit("Box 3", wardrobe.id);
      await createItem("Ski boots", wardrobe.id);

      const response = await call({
        method: "DELETE",
        url: `/storage-units/${wardrobe.id}`,
      });

      expect(response.json()).toMatchObject({
        error: { details: { itemCount: 1, childUnitCount: 1 } },
      });
    });

    it("keeps the unit after a refused delete", async () => {
      const box = await createUnit("Box 3");
      await createItem("Ski boots", box.id);

      await call({ method: "DELETE", url: `/storage-units/${box.id}` });

      const after = await call({ method: "GET", url: `/storage-units/${box.id}` });
      expect(after.statusCode).toBe(200);
    });

    it("answers 404 for a unit nobody created", async () => {
      const response = await call({ method: "DELETE", url: "/storage-units/ghost" });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /storage-units/:id/empty", () => {
    it("moves everything up to the parent by default", async () => {
      const room = await createUnit("Storage room", null, StorageUnitKind.ROOM);
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      const box = await createUnit("Box 3", wardrobe.id);
      const boots = await createItem("Ski boots", wardrobe.id);

      const response = await call({
        method: "POST",
        url: `/storage-units/${wardrobe.id}/empty`,
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        movedItems: ItemView[];
        movedChildUnits: UnitView[];
      };
      expect(body.movedItems.map((item) => item.id)).toEqual([boots.id]);
      expect(body.movedChildUnits.map((unit) => unit.id)).toEqual([box.id]);
      expect(body.movedItems[0]?.storageUnitId).toBe(room.id);
    });

    it("turns empty-then-delete into two calls (ADR 3)", async () => {
      const room = await createUnit("Storage room", null, StorageUnitKind.ROOM);
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      await createItem("Ski boots", wardrobe.id);

      await call({ method: "POST", url: `/storage-units/${wardrobe.id}/empty`, payload: {} });
      const response = await call({
        method: "DELETE",
        url: `/storage-units/${wardrobe.id}`,
      });

      expect(response.statusCode).toBe(204);
    });

    it("moves everything into an explicit target instead", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const box = await createUnit("Box 3");
      const boots = await createItem("Ski boots", box.id);

      const response = await call({
        method: "POST",
        url: `/storage-units/${box.id}/empty`,
        payload: { targetUnitId: garage.id },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { movedItems: ItemView[] };
      expect(body.movedItems.map((item) => item.id)).toEqual([boots.id]);
      expect(body.movedItems[0]?.storageUnitId).toBe(garage.id);
    });

    it("answers 422 for a root that holds items and was given no target", async () => {
      const box = await createUnit("Box 3");
      await createItem("Ski boots", box.id);

      const response = await call({
        method: "POST",
        url: `/storage-units/${box.id}/empty`,
        payload: {},
      });

      expect(response.statusCode).toBe(422);
      expect(errorCodeOf(response)).toBe("MISSING_EMPTY_TARGET");
    });

    it("answers 409 for a target inside the unit being emptied", async () => {
      const wardrobe = await createUnit("Metal wardrobe");
      const box = await createUnit("Box 3", wardrobe.id);

      const response = await call({
        method: "POST",
        url: `/storage-units/${wardrobe.id}/empty`,
        payload: { targetUnitId: box.id },
      });

      expect(response.statusCode).toBe(409);
      expect(errorCodeOf(response)).toBe("CYCLIC_STORAGE_UNIT_MOVE");
    });

    it("answers 404 for a unit nobody created", async () => {
      const response = await call({
        method: "POST",
        url: "/storage-units/ghost/empty",
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });

    it("answers 422 for a target nobody created", async () => {
      const box = await createUnit("Box 3");

      const response = await call({
        method: "POST",
        url: `/storage-units/${box.id}/empty`,
        payload: { targetUnitId: "ghost" },
      });

      expect(response.statusCode).toBe(422);
    });
  });

  describe("POST /items", () => {
    it("creates an item inside a unit", async () => {
      const box = await createUnit("Box 3");

      const response = await call({
        method: "POST",
        url: "/items",
        payload: { name: "Ski boots", storageUnitId: box.id },
      });

      expect(response.statusCode).toBe(201);
      const { item } = response.json() as { item: ItemView };
      expect(item).toMatchObject({ name: "Ski boots", storageUnitId: box.id, quantity: 1 });
      expect(response.headers["location"]).toBe(`/items/${item.id}`);
    });

    it("keeps tags in the order they were given", async () => {
      const box = await createUnit("Box 3");

      const item = await createItem("Ski boots", box.id, {
        tags: ["winter", "sport", "attic"],
      });

      expect(item.tags).toEqual(["winter", "sport", "attic"]);
    });

    it("answers 422 for a storage unit nobody created", async () => {
      const response = await call({
        method: "POST",
        url: "/items",
        payload: { name: "Ski boots", storageUnitId: "ghost" },
      });

      expect(response.statusCode).toBe(422);
      expect(errorCodeOf(response)).toBe("STORAGE_UNIT_NOT_FOUND");
    });

    describe("quantity", () => {
      it("accepts a quantity above one", async () => {
        const box = await createUnit("Box 3");

        const item = await createItem("Screws", box.id, { quantity: 40 });

        expect(item.quantity).toBe(40);
      });

      it("answers 422 for a quantity the DOMAIN refuses, not 400", async () => {
        const box = await createUnit("Box 3");

        const response = await call({
          method: "POST",
          url: "/items",
          payload: { name: "Screws", storageUnitId: box.id, quantity: 0 },
        });

        // "At least one, and a whole number" is a domain invariant. The
        // validation layer checks that `quantity` is a number and stops there,
        // so this rule has exactly one home.
        expect(response.statusCode).toBe(422);
        expect(errorCodeOf(response)).toBe("INVALID_QUANTITY");
      });

      it("answers 422 for a fractional quantity too", async () => {
        const box = await createUnit("Box 3");

        const response = await call({
          method: "POST",
          url: "/items",
          payload: { name: "Screws", storageUnitId: box.id, quantity: 1.5 },
        });

        expect(response.statusCode).toBe(422);
        expect(errorCodeOf(response)).toBe("INVALID_QUANTITY");
      });

      it("answers 400 for a quantity that is not a number at all", async () => {
        const box = await createUnit("Box 3");

        const response = await call({
          method: "POST",
          url: "/items",
          payload: { name: "Screws", storageUnitId: box.id, quantity: "forty" },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe("GET /items", () => {
    interface ItemAtLocationView {
      readonly item: ItemView;
      readonly path: readonly UnitView[];
      readonly location: string;
    }

    const listItems = async (
      url = "/items",
    ): Promise<readonly ItemAtLocationView[]> => {
      const response = await call({ method: "GET", url });

      expect(response.statusCode).toBe(200);

      return (response.json() as { items: readonly ItemAtLocationView[] }).items;
    };

    it("answers with an empty list for an empty house", async () => {
      await expect(listItems()).resolves.toEqual([]);
    });

    it("answers with every item, whichever box holds it", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const kitchen = await createUnit("Kitchen", null, StorageUnitKind.ROOM);
      await createItem("Cordless drill", garage.id);
      await createItem("Whisk", kitchen.id);

      const rows = await listItems();

      expect(rows.map((row) => row.item.name)).toEqual(["Cordless drill", "Whisk"]);
    });

    it("carries where each item is, as a path and as a sentence", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const wardrobe = await createUnit("Metal wardrobe", garage.id);
      const box = await createUnit("Box 3", wardrobe.id);
      await createItem("Cordless drill", box.id);

      const [row] = await listItems();

      // Both shapes, for the same reason a search result ships both: the path
      // makes every step tappable, the sentence saves a list row the work.
      expect(row?.path.map((unit) => unit.name)).toEqual([
        "Garage",
        "Metal wardrobe",
        "Box 3",
      ]);
      expect(row?.location).toBe("Garage > Metal wardrobe > Box 3");
    });

    it("orders by name, so two reads of an unchanged house look the same", async () => {
      const box = await createUnit("Box 3");
      await createItem("Whisk", box.id);
      await createItem("Anvil", box.id);
      await createItem("Drill", box.id);

      const rows = await listItems();

      expect(rows.map((row) => row.item.name)).toEqual(["Anvil", "Drill", "Whisk"]);
    });

    it("carries the whole item, not a name and an id", async () => {
      const box = await createUnit("Box 3");
      await createItem("HDMI 2.1", box.id, { tags: ["cables"], quantity: 3 });

      const [row] = await listItems();

      expect(row?.item.tags).toEqual(["cables"]);
      expect(row?.item.quantity).toBe(3);
    });

    it("answers one request where the client used to make one per unit", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const box = await createUnit("Box 3", garage.id);
      await createItem("Drill", box.id);
      await createItem("Whisk", garage.id);

      const rows = await listItems();

      expect(rows).toHaveLength(2);
    });

    it("refuses a page rather than pretending to answer one", async () => {
      const response = await call({ method: "GET", url: "/items?limit=20" });

      // There is no pagination here on purpose, and silently ignoring the
      // parameter would tell a client it got the first twenty of something.
      expect(response.statusCode).toBe(400);
      expect(errorCodeOf(response)).toBe("VALIDATION_FAILED");
    });

    it("follows a renamed box, because the location is computed", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      await createItem("Drill", garage.id);

      await call({
        method: "PATCH",
        url: `/storage-units/${garage.id}`,
        payload: { name: "Storage room" },
      });

      const [row] = await listItems();
      expect(row?.location).toBe("Storage room");
    });
  });

  describe("GET /items/:id", () => {
    it("returns the item and where in the house it is", async () => {
      const room = await createUnit("Storage room", null, StorageUnitKind.ROOM);
      const box = await createUnit("Box 3", room.id);
      const boots = await createItem("Ski boots", box.id);

      const response = await call({ method: "GET", url: `/items/${boots.id}` });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        item: ItemView;
        storageUnit: UnitView;
        path: UnitView[];
      };
      expect(body.item.id).toBe(boots.id);
      expect(body.storageUnit.id).toBe(box.id);
      expect(body.path.map((unit) => unit.name)).toEqual(["Storage room", "Box 3"]);
    });

    it("answers 404 for an item nobody created", async () => {
      const response = await call({ method: "GET", url: "/items/ghost" });

      expect(response.statusCode).toBe(404);
      expect(errorCodeOf(response)).toBe("ITEM_NOT_FOUND");
    });
  });

  describe("POST /items/move", () => {
    it("moves a batch of items in one call", async () => {
      const from = await createUnit("Box 3");
      const to = await createUnit("Box 4");
      const boots = await createItem("Ski boots", from.id);
      const gloves = await createItem("Gloves", from.id);

      const response = await call({
        method: "POST",
        url: "/items/move",
        payload: { itemIds: [boots.id, gloves.id], targetUnitId: to.id },
      });

      expect(response.statusCode).toBe(200);
      const { items } = response.json() as { items: ItemView[] };
      expect(items.map((item) => item.storageUnitId)).toEqual([to.id, to.id]);
    });

    it("is all or nothing: one unknown id rejects the whole batch", async () => {
      const from = await createUnit("Box 3");
      const to = await createUnit("Box 4");
      const boots = await createItem("Ski boots", from.id);

      const response = await call({
        method: "POST",
        url: "/items/move",
        payload: { itemIds: [boots.id, "ghost"], targetUnitId: to.id },
      });

      expect(response.statusCode).toBe(422);
      expect(errorCodeOf(response)).toBe("ITEM_NOT_FOUND");

      const after = await call({ method: "GET", url: `/items/${boots.id}` });
      expect((after.json() as { item: ItemView }).item.storageUnitId).toBe(from.id);
    });

    it("answers 422 for a target unit nobody created", async () => {
      const box = await createUnit("Box 3");
      const boots = await createItem("Ski boots", box.id);

      const response = await call({
        method: "POST",
        url: "/items/move",
        payload: { itemIds: [boots.id], targetUnitId: "ghost" },
      });

      expect(response.statusCode).toBe(422);
      expect(errorCodeOf(response)).toBe("STORAGE_UNIT_NOT_FOUND");
    });

    it("answers 400 when itemIds is not a list of ids", async () => {
      const box = await createUnit("Box 3");

      const response = await call({
        method: "POST",
        url: "/items/move",
        payload: { itemIds: "everything", targetUnitId: box.id },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("PATCH /items/:id", () => {
    it("renames an item and answers with the new one", async () => {
      const box = await createUnit("Box 3");
      const drill = await createItem("Drill", box.id);

      const response = await call({
        method: "PATCH",
        url: `/items/${drill.id}`,
        payload: { name: "Cordless drill" },
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as { item: ItemView }).item.name).toBe("Cordless drill");
    });

    it("stores the new name, so the next read sees it", async () => {
      const box = await createUnit("Box 3");
      const drill = await createItem("Drill", box.id);

      await call({
        method: "PATCH",
        url: `/items/${drill.id}`,
        payload: { name: "Cordless drill" },
      });

      const after = await call({ method: "GET", url: `/items/${drill.id}` });
      expect((after.json() as { item: ItemView }).item.name).toBe("Cordless drill");
    });

    it("replaces the tags outright, so a mistyped one can come off", async () => {
      const box = await createUnit("Box 3");
      const cable = await createItem("HDMI 2.1", box.id, {
        tags: ["cables", "vidoe"],
      });

      const response = await call({
        method: "PATCH",
        url: `/items/${cable.id}`,
        payload: { tags: ["cables", "video"] },
      });

      expect((response.json() as { item: ItemView }).item.tags).toEqual([
        "cables",
        "video",
      ]);
    });

    it("takes every tag off when the request asks for none", async () => {
      const box = await createUnit("Box 3");
      const cable = await createItem("HDMI 2.1", box.id, { tags: ["cables"] });

      const response = await call({
        method: "PATCH",
        url: `/items/${cable.id}`,
        payload: { tags: [] },
      });

      expect((response.json() as { item: ItemView }).item.tags).toEqual([]);
    });

    it("changes the quantity and clears the description in one request", async () => {
      const box = await createUnit("Box 3");
      const screws = await createItem("Screws", box.id, {
        quantity: 10,
        description: "Mixed",
      });

      const response = await call({
        method: "PATCH",
        url: `/items/${screws.id}`,
        payload: { quantity: 250, description: null },
      });

      const { item } = response.json() as {
        item: ItemView & { description: string | null };
      };
      expect(item.quantity).toBe(250);
      expect(item.description).toBeNull();
      expect(item.name).toBe("Screws");
    });

    it("answers 422 for a quantity the domain refuses (ADR 8)", async () => {
      const box = await createUnit("Box 3");
      const drill = await createItem("Drill", box.id);

      const response = await call({
        method: "PATCH",
        url: `/items/${drill.id}`,
        payload: { quantity: 0 },
      });

      // Fix the request, not the world: no amount of waiting makes a
      // quantity of zero acceptable.
      expect(response.statusCode).toBe(422);
      expect(errorCodeOf(response)).toBe("INVALID_QUANTITY");
    });

    it("leaves the item untouched when the quantity is refused", async () => {
      const box = await createUnit("Box 3");
      const drill = await createItem("Drill", box.id);

      await call({
        method: "PATCH",
        url: `/items/${drill.id}`,
        payload: { name: "Cordless drill", quantity: 0 },
      });

      const after = await call({ method: "GET", url: `/items/${drill.id}` });
      expect((after.json() as { item: ItemView }).item.name).toBe("Drill");
    });

    it("answers 404 for an item nobody created", async () => {
      const response = await call({
        method: "PATCH",
        url: "/items/ghost",
        payload: { name: "Cordless drill" },
      });

      expect(response.statusCode).toBe(404);
      expect(errorCodeOf(response)).toBe("ITEM_NOT_FOUND");
    });

    describe("it cannot move anything", () => {
      it("refuses a storageUnitId rather than ignoring it", async () => {
        const box = await createUnit("Box 3");
        const crate = await createUnit("Crate");
        const drill = await createItem("Drill", box.id);

        const response = await call({
          method: "PATCH",
          url: `/items/${drill.id}`,
          payload: { name: "Cordless drill", storageUnitId: crate.id },
        });

        expect(response.statusCode).toBe(400);
        expect(errorCodeOf(response)).toBe("VALIDATION_FAILED");
        expect(response.body).toContain("storageUnitId");
      });

      it("leaves the item in the unit it was in", async () => {
        const box = await createUnit("Box 3");
        const drill = await createItem("Drill", box.id);

        const response = await call({
          method: "PATCH",
          url: `/items/${drill.id}`,
          payload: { name: "Cordless drill" },
        });

        expect((response.json() as { item: ItemView }).item.storageUnitId).toBe(box.id);
      });
    });

    describe("input validation", () => {
      it("refuses a request that names nothing to change", async () => {
        const box = await createUnit("Box 3");
        const drill = await createItem("Drill", box.id);

        const response = await call({
          method: "PATCH",
          url: `/items/${drill.id}`,
          payload: {},
        });

        expect(response.statusCode).toBe(400);
        expect(errorCodeOf(response)).toBe("VALIDATION_FAILED");
      });

      it("refuses an empty name", async () => {
        const box = await createUnit("Box 3");
        const drill = await createItem("Drill", box.id);

        const response = await call({
          method: "PATCH",
          url: `/items/${drill.id}`,
          payload: { name: "" },
        });

        expect(response.statusCode).toBe(400);
      });

      it("refuses a photos list, which the photo routes own (ADR 9)", async () => {
        const box = await createUnit("Box 3");
        const drill = await createItem("Drill", box.id);

        const response = await call({
          method: "PATCH",
          url: `/items/${drill.id}`,
          payload: { photos: [] },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe("DELETE /items/:id", () => {
    it("deletes the item unconditionally (ADR 3)", async () => {
      const box = await createUnit("Box 3");
      const boots = await createItem("Ski boots", box.id);

      const response = await call({ method: "DELETE", url: `/items/${boots.id}` });

      expect(response.statusCode).toBe(200);
      const after = await call({ method: "GET", url: `/items/${boots.id}` });
      expect(after.statusCode).toBe(404);
    });

    it("hands back the photos nothing references any more", async () => {
      const box = await createUnit("Box 3");
      const boots = await createItem("Ski boots", box.id, {
        photos: ["photo-1", "photo-2"],
      });

      const response = await call({ method: "DELETE", url: `/items/${boots.id}` });

      expect(response.json()).toEqual({ releasedPhotoIds: ["photo-1", "photo-2"] });
    });

    it("answers 404 for an item nobody created", async () => {
      const response = await call({ method: "DELETE", url: "/items/ghost" });

      expect(response.statusCode).toBe(404);
    });

    it("lets the unit be deleted afterwards", async () => {
      const box = await createUnit("Box 3");
      const boots = await createItem("Ski boots", box.id);

      await call({ method: "DELETE", url: `/items/${boots.id}` });
      const response = await call({ method: "DELETE", url: `/storage-units/${box.id}` });

      expect(response.statusCode).toBe(204);
    });
  });

  describe("one shared inventory", () => {
    it("shows a second account exactly what the first one created", async () => {
      const box = await createUnit("Box 3");
      await createItem("Ski boots", box.id);

      await api.createUser("marta", "another-password");
      const martasToken = await api.login("marta", "another-password");

      const response = await api.app.inject({
        method: "GET",
        url: `/storage-units/${box.id}`,
        headers: api.authHeaders(martasToken),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: ItemView[] };
      expect(body.items.map((item) => item.name)).toEqual(["Ski boots"]);
    });

    it("lets a second account delete what the first one created", async () => {
      const box = await createUnit("Box 3");

      await api.createUser("marta", "another-password");
      const martasToken = await api.login("marta", "another-password");

      const response = await api.app.inject({
        method: "DELETE",
        url: `/storage-units/${box.id}`,
        headers: api.authHeaders(martasToken),
      });

      expect(response.statusCode).toBe(204);
    });
  });
});
