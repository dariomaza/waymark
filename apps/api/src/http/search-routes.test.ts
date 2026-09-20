import { StorageUnitKind } from "@ariadna/domain";
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
  readonly name: string;
  readonly parentId: string | null;
}

interface ItemView {
  readonly id: string;
  readonly name: string;
  readonly storageUnitId: string;
  readonly tags: readonly string[];
}

interface ItemResultView {
  readonly item: ItemView;
  readonly path: readonly UnitView[];
  readonly location: string;
  readonly matchedFields: readonly string[];
}

interface UnitResultView {
  readonly unit: UnitView;
  readonly path: readonly UnitView[];
  readonly location: string;
  readonly matchedFields: readonly string[];
}

interface SearchView {
  readonly query: string;
  readonly terms: readonly string[];
  readonly items: readonly ItemResultView[];
  readonly storageUnits: readonly UnitResultView[];
}

const errorCodeOf = (response: LightMyRequestResponse): string =>
  (response.json() as { error: { code: string } }).error.code;

describe("search over HTTP", () => {
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

  const search = async (query: string): Promise<SearchView> => {
    const response = await call({ method: "GET", url: `/search?${query}` });

    expect(response.statusCode).toBe(200);

    return response.json() as SearchView;
  };

  const itemNames = async (query: string): Promise<string[]> =>
    (await search(query)).items.map((result) => result.item.name);

  const unitNames = async (query: string): Promise<string[]> =>
    (await search(query)).storageUnits.map((result) => result.unit.name);

  describe("it needs a session, like everything else", () => {
    it("answers 401 for an anonymous caller", async () => {
      const response = await api.app.inject({
        method: "GET",
        url: "/search?q=drill",
      });

      expect(response.statusCode).toBe(401);
    });

    it("answers 401 for a revoked token", async () => {
      await call({ method: "POST", url: "/auth/logout" });

      const response = await call({ method: "GET", url: "/search?q=drill" });

      expect(response.statusCode).toBe(401);
    });

    it("answers 401 for a bearer token that was never issued", async () => {
      const response = await api.app.inject({
        method: "GET",
        url: "/search?q=drill",
        headers: { authorization: "Bearer not-a-real-token" },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("what the request may say", () => {
    it("refuses a request with no query at all", async () => {
      const response = await call({ method: "GET", url: "/search" });

      expect(response.statusCode).toBe(400);
      expect(errorCodeOf(response)).toBe("VALIDATION_FAILED");
    });

    it("refuses a query parameter nobody has heard of", async () => {
      const response = await call({ method: "GET", url: "/search?q=drill&owner=dario" });

      expect(response.statusCode).toBe(400);
    });

    it("refuses a limit that is not a number", async () => {
      const response = await call({ method: "GET", url: "/search?q=drill&limit=many" });

      expect(response.statusCode).toBe(400);
    });

    it("refuses a limit of zero and a negative one", async () => {
      await expect(
        call({ method: "GET", url: "/search?q=drill&limit=0" }),
      ).resolves.toMatchObject({ statusCode: 400 });
      await expect(
        call({ method: "GET", url: "/search?q=drill&limit=-1" }),
      ).resolves.toMatchObject({ statusCode: 400 });
    });

    it("refuses a limit past the cap, rather than quietly honouring it", async () => {
      const response = await call({ method: "GET", url: "/search?q=drill&limit=5000" });

      expect(response.statusCode).toBe(400);
    });

    it("refuses a query longer than anybody would type", async () => {
      const response = await call({
        method: "GET",
        url: `/search?q=${"a".repeat(500)}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it("answers 422 when the scope names a unit that does not exist", async () => {
      const response = await call({
        method: "GET",
        url: "/search?q=drill&within=ghost",
      });

      // 422 and not 404: the route exists, and the id came from the request
      // rather than from the path (ADR 8).
      expect(response.statusCode).toBe(422);
      expect(errorCodeOf(response)).toBe("STORAGE_UNIT_NOT_FOUND");
    });
  });

  describe("finding a thing", () => {
    it("finds an item by a word in its name", async () => {
      const box = await createUnit("Box 3");
      await createItem("Cordless drill", box.id);

      await expect(itemNames("q=drill")).resolves.toEqual(["Cordless drill"]);
    });

    it("finds an item by a tag that is nowhere in its name", async () => {
      const box = await createUnit("Box 3");
      await createItem("HDMI 2.1", box.id, { tags: ["cables", "video"] });

      const results = await search("q=cables");

      expect(results.items.map((result) => result.item.name)).toEqual(["HDMI 2.1"]);
      expect(results.items[0]?.matchedFields).toEqual(["TAG"]);
    });

    it("finds an item by a word in its description", async () => {
      const box = await createUnit("Box 3");
      await createItem("Caja azul", box.id, { description: "Tornillos y tacos" });

      const results = await search("q=tornillos");

      expect(results.items[0]?.matchedFields).toEqual(["DESCRIPTION"]);
    });

    it("finds a storage unit by its name", async () => {
      await createUnit("Armario metálico", null, StorageUnitKind.FURNITURE);

      const results = await search("q=armario");

      expect(results.storageUnits.map((result) => result.unit.name)).toEqual([
        "Armario metálico",
      ]);
      expect(results.storageUnits[0]?.matchedFields).toEqual(["NAME"]);
    });

    it("answers with the whole item, so a list screen needs no second request", async () => {
      const box = await createUnit("Box 3");
      const drill = await createItem("Cordless drill", box.id, {
        quantity: 2,
        tags: ["herramientas"],
      });

      const results = await search("q=drill");

      expect(results.items[0]?.item).toMatchObject({
        id: drill.id,
        name: "Cordless drill",
        quantity: 2,
        tags: ["herramientas"],
        storageUnitId: box.id,
      });
    });

    it("repeats the query back, and the terms it was folded into", async () => {
      const results = await search("q=C%C3%A1mara%20R%C3%89FLEX");

      expect(results.query).toBe("Cámara RÉFLEX");
      expect(results.terms).toEqual(["camara", "reflex"]);
    });

    it("answers nothing for an empty query", async () => {
      const box = await createUnit("Box 3");
      await createItem("Cordless drill", box.id);

      const results = await search("q=");

      expect(results.terms).toEqual([]);
      expect(results.items).toEqual([]);
      expect(results.storageUnits).toEqual([]);
    });

    it("answers nothing for a query of nothing but spaces", async () => {
      const box = await createUnit("Box 3");
      await createItem("Cordless drill", box.id);

      const results = await search("q=%20%20%20");

      expect(results.items).toEqual([]);
    });

    it("answers nothing for a query that matches nothing", async () => {
      const box = await createUnit("Box 3");
      await createItem("Cordless drill", box.id);

      const results = await search("q=submarino");

      expect(results.items).toEqual([]);
      expect(results.storageUnits).toEqual([]);
    });
  });

  describe("accents, in both directions", () => {
    it("finds an accented item from a query without the accent", async () => {
      const box = await createUnit("Box 3");
      await createItem("Cámara réflex", box.id);
      await createItem("Batería de coche", box.id);

      await expect(itemNames("q=camara")).resolves.toEqual(["Cámara réflex"]);
      await expect(itemNames("q=bateria")).resolves.toEqual(["Batería de coche"]);
    });

    it("finds an unaccented item from a query that has the accent", async () => {
      const box = await createUnit("Box 3");
      await createItem("Camara compacta", box.id);
      await createItem("Bateria externa", box.id);

      await expect(itemNames("q=c%C3%A1mara")).resolves.toEqual(["Camara compacta"]);
      await expect(itemNames("q=bater%C3%ADa")).resolves.toEqual(["Bateria externa"]);
    });

    it("folds the accents on a tag too", async () => {
      const box = await createUnit("Box 3");
      await createItem("Trípode", box.id, { tags: ["fotografía"] });

      await expect(itemNames("q=fotografia")).resolves.toEqual(["Trípode"]);
    });

    it("finds a unit whose accent the query left out", async () => {
      await createUnit("Armario metálico");

      await expect(unitNames("q=metalico")).resolves.toEqual(["Armario metálico"]);
    });
  });

  describe("before the word is finished", () => {
    it("finds an item from the start of a word in its name", async () => {
      const box = await createUnit("Box 3");
      await createItem("Cables de red", box.id);

      await expect(itemNames("q=cab")).resolves.toEqual(["Cables de red"]);
    });

    it("finds an item from the start of one of its tags", async () => {
      const box = await createUnit("Box 3");
      await createItem("HDMI 2.1", box.id, { tags: ["cables"] });

      await expect(itemNames("q=cab")).resolves.toEqual(["HDMI 2.1"]);
    });

    it("finds a unit from the start of its name", async () => {
      await createUnit("Armario metálico");

      await expect(unitNames("q=arma")).resolves.toEqual(["Armario metálico"]);
    });
  });

  describe("every result says where it is", () => {
    it("carries the breadcrumb of the unit holding the item", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const wardrobe = await createUnit("Metal wardrobe", garage.id, StorageUnitKind.FURNITURE);
      const box = await createUnit("Box 3", wardrobe.id);
      await createItem("Cordless drill", box.id);

      const [result] = (await search("q=drill")).items;

      expect(result?.path.map((step) => step.name)).toEqual([
        "Garage",
        "Metal wardrobe",
        "Box 3",
      ]);
      expect(result?.location).toBe("Garage > Metal wardrobe > Box 3");
    });

    it("carries the breadcrumb of a matched unit, ending in the unit itself", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const wardrobe = await createUnit("Metal wardrobe", garage.id);
      await createUnit("Box 3", wardrobe.id);

      const [result] = (await search("q=box")).storageUnits;

      expect(result?.location).toBe("Garage > Metal wardrobe > Box 3");
    });

    it("carries a single step for something in a root unit", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      await createItem("Cordless drill", garage.id);

      const [result] = (await search("q=drill")).items;

      expect(result?.location).toBe("Garage");
      expect(result?.path).toHaveLength(1);
    });

    it("carries the whole unit at every step, not only its name", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const box = await createUnit("Box 3", garage.id);
      await createItem("Cordless drill", box.id);

      const [result] = (await search("q=drill")).items;

      expect(result?.path[0]).toMatchObject({ id: garage.id, parentId: null });
      expect(result?.path[1]).toMatchObject({ id: box.id, parentId: garage.id });
    });
  });

  describe("searching inside one place", () => {
    let garage: UnitView;
    let deepBox: UnitView;
    let kitchen: UnitView;

    beforeEach(async () => {
      garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const wardrobe = await createUnit("Metal wardrobe", garage.id);
      const shelf = await createUnit("Top shelf", wardrobe.id);
      deepBox = await createUnit("Box 3", shelf.id);
      kitchen = await createUnit("Kitchen", null, StorageUnitKind.ROOM);
    });

    it("reaches an item four levels down", async () => {
      await createItem("Cordless drill", deepBox.id);

      await expect(
        itemNames(`q=drill&within=${garage.id}`),
      ).resolves.toEqual(["Cordless drill"]);
    });

    it("leaves out an item in another room", async () => {
      await createItem("Cordless drill", deepBox.id);
      await createItem("Corded drill", kitchen.id);

      await expect(
        itemNames(`q=drill&within=${garage.id}`),
      ).resolves.toEqual(["Cordless drill"]);
    });

    it("includes an item held directly by the unit that scopes the search", async () => {
      await createItem("Cordless drill", garage.id);

      await expect(
        itemNames(`q=drill&within=${garage.id}`),
      ).resolves.toEqual(["Cordless drill"]);
    });

    it("reaches a unit nested at any depth", async () => {
      await expect(unitNames(`q=box&within=${garage.id}`)).resolves.toEqual(["Box 3"]);
    });

    it("does not answer with the unit that scopes the search", async () => {
      await expect(unitNames(`q=garage&within=${garage.id}`)).resolves.toEqual([]);
    });

    it("leaves out a unit in another subtree", async () => {
      await createUnit("Garage box", kitchen.id);

      await expect(unitNames(`q=box&within=${garage.id}`)).resolves.toEqual(["Box 3"]);
    });

    it("still carries the breadcrumb from the real root, not from the scope", async () => {
      await createItem("Cordless drill", deepBox.id);

      const [result] = (await search(`q=drill&within=${garage.id}`)).items;

      expect(result?.location).toBe("Garage > Metal wardrobe > Top shelf > Box 3");
    });
  });

  describe("the order results come back in", () => {
    it("puts a name match above a description match", async () => {
      const box = await createUnit("Box 3");
      await createItem("Trípode", box.id, { description: "Para la cámara réflex" });
      await createItem("Cámara réflex", box.id);

      await expect(itemNames("q=camara")).resolves.toEqual([
        "Cámara réflex",
        "Trípode",
      ]);
    });

    it("puts a name above a tag, and a tag above a description", async () => {
      const box = await createUnit("Box 3");
      await createItem("Caja de repuestos", box.id, {
        description: "Varios cables sueltos",
      });
      await createItem("HDMI 2.1", box.id, { tags: ["cables"] });
      await createItem("Cables de red", box.id);

      await expect(itemNames("q=cables")).resolves.toEqual([
        "Cables de red",
        "HDMI 2.1",
        "Caja de repuestos",
      ]);
    });

    it("puts a whole word above one the query merely starts", async () => {
      const box = await createUnit("Box 3");
      await createItem("Cablerio antiguo", box.id);
      await createItem("Cable", box.id);

      await expect(itemNames("q=cable")).resolves.toEqual([
        "Cable",
        "Cablerio antiguo",
      ]);
    });

    it("answers the same order twice, so the screen does not shuffle", async () => {
      const box = await createUnit("Box 3");
      await createItem("Drill B", box.id);
      await createItem("Drill A", box.id);

      await expect(itemNames("q=drill")).resolves.toEqual(["Drill A", "Drill B"]);
      await expect(itemNames("q=drill")).resolves.toEqual(["Drill A", "Drill B"]);
    });

    it("honours a limit", async () => {
      const box = await createUnit("Box 3");
      for (const name of ["Drill A", "Drill B", "Drill C"]) {
        await createItem(name, box.id);
      }

      await expect(itemNames("q=drill&limit=2")).resolves.toEqual([
        "Drill A",
        "Drill B",
      ]);
    });
  });

  describe("staying right while the inventory changes", () => {
    it("answers with the new breadcrumb once an item is moved", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const kitchen = await createUnit("Kitchen", null, StorageUnitKind.ROOM);
      const drill = await createItem("Cordless drill", garage.id);

      const moved = await call({
        method: "POST",
        url: "/items/move",
        payload: { itemIds: [drill.id], targetUnitId: kitchen.id },
      });
      expect(moved.statusCode).toBe(200);

      const [result] = (await search("q=drill")).items;
      expect(result?.location).toBe("Kitchen");
    });

    it("answers with the new breadcrumb once the unit holding it is moved", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const kitchen = await createUnit("Kitchen", null, StorageUnitKind.ROOM);
      const box = await createUnit("Box 3", garage.id);
      await createItem("Cordless drill", box.id);

      const moved = await call({
        method: "POST",
        url: `/storage-units/${box.id}/move`,
        payload: { parentId: kitchen.id },
      });
      expect(moved.statusCode).toBe(200);

      const [result] = (await search("q=drill")).items;
      expect(result?.location).toBe("Kitchen > Box 3");
    });

    it("follows a moved subtree when the search is scoped", async () => {
      const garage = await createUnit("Garage", null, StorageUnitKind.ROOM);
      const kitchen = await createUnit("Kitchen", null, StorageUnitKind.ROOM);
      const box = await createUnit("Box 3", garage.id);
      await createItem("Cordless drill", box.id);

      await call({
        method: "POST",
        url: `/storage-units/${box.id}/move`,
        payload: { parentId: kitchen.id },
      });

      await expect(itemNames(`q=drill&within=${garage.id}`)).resolves.toEqual([]);
      await expect(itemNames(`q=drill&within=${kitchen.id}`)).resolves.toEqual([
        "Cordless drill",
      ]);
    });

    it("stops finding an item once it is deleted", async () => {
      const box = await createUnit("Box 3");
      const drill = await createItem("Cordless drill", box.id, { tags: ["taladros"] });

      const deleted = await call({ method: "DELETE", url: `/items/${drill.id}` });
      expect(deleted.statusCode).toBe(200);

      await expect(itemNames("q=drill")).resolves.toEqual([]);
      await expect(itemNames("q=taladros")).resolves.toEqual([]);
    });

    it("stops finding a unit once it is deleted", async () => {
      const crate = await createUnit("Wooden crate");

      const deleted = await call({ method: "DELETE", url: `/storage-units/${crate.id}` });
      expect(deleted.statusCode).toBe(204);

      await expect(unitNames("q=crate")).resolves.toEqual([]);
    });

    it("finds an item the moment it is created", async () => {
      const box = await createUnit("Box 3");

      await expect(itemNames("q=taladro")).resolves.toEqual([]);
      await createItem("Taladro", box.id);
      await expect(itemNames("q=taladro")).resolves.toEqual(["Taladro"]);
    });
  });
});
