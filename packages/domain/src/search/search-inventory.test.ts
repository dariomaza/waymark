import { beforeEach, describe, expect, it } from "vitest";

import { CreateItem } from "../items/create-item.js";
import { InMemoryItemRepository } from "../items/item-repository.fake.js";
import { MoveItems } from "../items/move-items.js";
import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { unitId, type ItemId, type UnitId } from "../shared/identity.js";
import { CreateStorageUnit } from "../storage-units/create-storage-unit.js";
import { formatStorageUnitPath } from "../storage-units/get-storage-unit-path.js";
import { StorageUnitNotFound } from "../storage-units/storage-unit-errors.js";
import { InMemoryStorageUnitRepository } from "../storage-units/storage-unit-repository.fake.js";
import { StorageUnitKind } from "../storage-units/storage-unit.js";
import { SearchInventory } from "./search-inventory.js";
import { SearchMatchField } from "./search-match.js";
import { InMemorySearchRepository } from "./search-repository.fake.js";

describe("SearchInventory", () => {
  let storageUnits: InMemoryStorageUnitRepository;
  let items: InMemoryItemRepository;
  let createStorageUnit: CreateStorageUnit;
  let createItem: CreateItem;
  let moveItems: MoveItems;
  let searchInventory: SearchInventory;

  const clock = new FakeClock(new Date("2026-04-01T10:00:00.000Z"));

  const unit = async (name: string, parentId: UnitId | null = null) =>
    createStorageUnit.execute({ parentId, name, kind: StorageUnitKind.BOX });

  const item = async (
    name: string,
    storageUnitId: UnitId,
    extra: { readonly description?: string; readonly tags?: readonly string[] } = {},
  ) =>
    createItem.execute({
      storageUnitId,
      name,
      description: extra.description ?? null,
      tags: extra.tags ?? [],
    });

  const search = async (
    query: string,
    options: { readonly withinUnitId?: UnitId; readonly limit?: number } = {},
  ) => searchInventory.execute({ query, ...options });

  const itemNames = async (query: string, options = {}): Promise<string[]> =>
    (await search(query, options)).items.map((result) => result.item.name);

  const unitNames = async (query: string, options = {}): Promise<string[]> =>
    (await search(query, options)).storageUnits.map((result) => result.unit.name);

  beforeEach(() => {
    storageUnits = new InMemoryStorageUnitRepository();
    items = new InMemoryItemRepository();
    createStorageUnit = new CreateStorageUnit({
      storageUnits,
      ids: new SequentialIdGenerator("unit"),
      publicIds: new SequentialPublicIdGenerator(),
      clock,
    });
    createItem = new CreateItem({
      items,
      storageUnits,
      ids: new SequentialIdGenerator("item"),
      clock,
    });
    moveItems = new MoveItems({ items, storageUnits, clock });
    searchInventory = new SearchInventory({
      search: new InMemorySearchRepository({ items, storageUnits }),
      storageUnits,
    });
  });

  describe("what a query answers", () => {
    it("finds an item by a word in its name", async () => {
      const box = await unit("Box 3");
      await item("Cordless drill", box.id);

      await expect(itemNames("drill")).resolves.toEqual(["Cordless drill"]);
    });

    it("finds an item by a tag that is nowhere in its name", async () => {
      const box = await unit("Box 3");
      await item("HDMI 2.1", box.id, { tags: ["cables", "video"] });

      await expect(itemNames("cables")).resolves.toEqual(["HDMI 2.1"]);
    });

    it("finds an item by a word in its description", async () => {
      const box = await unit("Box 3");
      await item("Caja azul", box.id, { description: "Tornillos y tacos" });

      await expect(itemNames("tornillos")).resolves.toEqual(["Caja azul"]);
    });

    it("finds a storage unit by its name", async () => {
      await unit("Armario metálico");

      await expect(unitNames("armario")).resolves.toEqual(["Armario metálico"]);
    });

    it("says which fields answered the query", async () => {
      const box = await unit("Box 3");
      await item("HDMI 2.1", box.id, { tags: ["cables"] });

      const [result] = (await search("cables")).items;

      expect(result?.matchedFields).toEqual([SearchMatchField.TAG]);
    });

    it("answers nothing at all for an empty query", async () => {
      const box = await unit("Box 3");
      await item("Cordless drill", box.id);

      const results = await search("   ");

      expect(results.terms).toEqual([]);
      expect(results.items).toEqual([]);
      expect(results.storageUnits).toEqual([]);
    });

    it("answers nothing for a query that matches nothing", async () => {
      const box = await unit("Box 3");
      await item("Cordless drill", box.id);

      const results = await search("submarino");

      expect(results.items).toEqual([]);
      expect(results.storageUnits).toEqual([]);
    });

    it("reports the terms it actually searched for", async () => {
      const results = await search("Cámara RÉFLEX");

      expect(results.terms).toEqual(["camara", "reflex"]);
    });
  });

  describe("accents", () => {
    it("finds an accented item when the query has none", async () => {
      const box = await unit("Box 3");
      await item("Cámara réflex", box.id);
      await item("Batería de coche", box.id);

      await expect(itemNames("camara")).resolves.toEqual(["Cámara réflex"]);
      await expect(itemNames("bateria")).resolves.toEqual(["Batería de coche"]);
    });

    it("finds an unaccented item when the query has the accent", async () => {
      const box = await unit("Box 3");
      await item("Camara compacta", box.id);
      await item("Bateria externa", box.id);

      await expect(itemNames("cámara")).resolves.toEqual(["Camara compacta"]);
      await expect(itemNames("batería")).resolves.toEqual(["Bateria externa"]);
    });

    it("finds a storage unit whose accent the query left out", async () => {
      await unit("Armario metálico");

      await expect(unitNames("metalico")).resolves.toEqual(["Armario metálico"]);
    });
  });

  describe("prefixes", () => {
    it("finds a word before it has been finished", async () => {
      const box = await unit("Box 3");
      await item("Cables de red", box.id);

      await expect(itemNames("cab")).resolves.toEqual(["Cables de red"]);
    });

    it("finds a tag before it has been finished", async () => {
      const box = await unit("Box 3");
      await item("HDMI 2.1", box.id, { tags: ["cables"] });

      await expect(itemNames("cab")).resolves.toEqual(["HDMI 2.1"]);
    });

    it("finds a unit before its name has been finished", async () => {
      await unit("Armario metálico");

      await expect(unitNames("arma")).resolves.toEqual(["Armario metálico"]);
    });

    it("does not match a query longer than the word it is looking at", async () => {
      const box = await unit("Box 3");
      await item("Cab", box.id);

      await expect(itemNames("cables")).resolves.toEqual([]);
    });
  });

  describe("breadcrumbs", () => {
    it("carries the whole path down to the unit holding the item", async () => {
      const garage = await unit("Garage");
      const wardrobe = await unit("Metal wardrobe", garage.id);
      const box = await unit("Box 3", wardrobe.id);
      await item("Cordless drill", box.id);

      const [result] = (await search("drill")).items;

      expect(result?.path.map((step) => step.name)).toEqual([
        "Garage",
        "Metal wardrobe",
        "Box 3",
      ]);
      expect(formatStorageUnitPath(result?.path ?? [])).toBe(
        "Garage > Metal wardrobe > Box 3",
      );
    });

    it("carries the path of a matched unit, ending in the unit itself", async () => {
      const garage = await unit("Garage");
      const wardrobe = await unit("Metal wardrobe", garage.id);
      await unit("Box 3", wardrobe.id);

      const [result] = (await search("box")).storageUnits;

      expect(formatStorageUnitPath(result?.path ?? [])).toBe(
        "Garage > Metal wardrobe > Box 3",
      );
    });

    it("carries a path of one step for an item in a root unit", async () => {
      const garage = await unit("Garage");
      await item("Cordless drill", garage.id);

      const [result] = (await search("drill")).items;

      expect(formatStorageUnitPath(result?.path ?? [])).toBe("Garage");
    });

    it("gives each result its own path", async () => {
      const garage = await unit("Garage");
      const kitchen = await unit("Kitchen");
      await item("Drill A", garage.id);
      await item("Drill B", kitchen.id);

      const results = await search("drill");

      expect(
        results.items.map((result) => formatStorageUnitPath(result.path)),
      ).toEqual(["Garage", "Kitchen"]);
    });
  });

  describe("scoping to a subtree", () => {
    let garage: Awaited<ReturnType<typeof unit>>;
    let deepBox: Awaited<ReturnType<typeof unit>>;
    let kitchen: Awaited<ReturnType<typeof unit>>;

    beforeEach(async () => {
      garage = await unit("Garage");
      const wardrobe = await unit("Metal wardrobe", garage.id);
      const shelf = await unit("Top shelf", wardrobe.id);
      deepBox = await unit("Box 3", shelf.id);
      kitchen = await unit("Kitchen");
    });

    it("finds an item four levels below the scope", async () => {
      await item("Cordless drill", deepBox.id);

      await expect(
        itemNames("drill", { withinUnitId: garage.id }),
      ).resolves.toEqual(["Cordless drill"]);
    });

    it("leaves out an item that matches outside the scope", async () => {
      await item("Cordless drill", deepBox.id);
      await item("Corded drill", kitchen.id);

      await expect(
        itemNames("drill", { withinUnitId: garage.id }),
      ).resolves.toEqual(["Cordless drill"]);
    });

    it("finds an item held directly by the unit that scopes the search", async () => {
      await item("Cordless drill", garage.id);

      await expect(
        itemNames("drill", { withinUnitId: garage.id }),
      ).resolves.toEqual(["Cordless drill"]);
    });

    it("finds a unit nested at any depth inside the scope", async () => {
      await expect(
        unitNames("box", { withinUnitId: garage.id }),
      ).resolves.toEqual(["Box 3"]);
    });

    it("does not answer with the unit that scopes the search", async () => {
      await expect(
        unitNames("garage", { withinUnitId: garage.id }),
      ).resolves.toEqual([]);
    });

    it("leaves out a unit that matches in another subtree", async () => {
      await unit("Garage box", kitchen.id);

      await expect(
        unitNames("box", { withinUnitId: garage.id }),
      ).resolves.toEqual(["Box 3"]);
    });

    it("refuses a scope that names nothing", async () => {
      await expect(
        search("drill", { withinUnitId: unitId("ghost") }),
      ).rejects.toBeInstanceOf(StorageUnitNotFound);
    });
  });

  describe("ranking", () => {
    it("puts a name match above a description match", async () => {
      const box = await unit("Box 3");
      await item("Trípode", box.id, { description: "Para la cámara réflex" });
      await item("Cámara réflex", box.id);

      await expect(itemNames("camara")).resolves.toEqual([
        "Cámara réflex",
        "Trípode",
      ]);
    });

    it("puts a name match above a tag match, and a tag match above a description", async () => {
      const box = await unit("Box 3");
      await item("Caja de repuestos", box.id, { description: "Varios cables sueltos" });
      await item("HDMI 2.1", box.id, { tags: ["cables"] });
      await item("Cables de red", box.id);

      await expect(itemNames("cables")).resolves.toEqual([
        "Cables de red",
        "HDMI 2.1",
        "Caja de repuestos",
      ]);
    });

    it("puts a whole word above a word the term merely starts", async () => {
      const box = await unit("Box 3");
      await item("Cablerio antiguo", box.id);
      await item("Cable", box.id);

      await expect(itemNames("cable")).resolves.toEqual([
        "Cable",
        "Cablerio antiguo",
      ]);
    });

    it("breaks a tie by name, so two reads never shuffle", async () => {
      const box = await unit("Box 3");
      await item("Drill B", box.id);
      await item("Drill A", box.id);

      await expect(itemNames("drill")).resolves.toEqual(["Drill A", "Drill B"]);
      await expect(itemNames("drill")).resolves.toEqual(["Drill A", "Drill B"]);
    });
  });

  describe("limits", () => {
    it("answers at most the requested number of items", async () => {
      const box = await unit("Box 3");
      for (const name of ["Drill A", "Drill B", "Drill C"]) {
        await item(name, box.id);
      }

      await expect(itemNames("drill", { limit: 2 })).resolves.toEqual([
        "Drill A",
        "Drill B",
      ]);
    });

    it("answers at most the requested number of units", async () => {
      await unit("Box A");
      await unit("Box B");

      await expect(unitNames("box", { limit: 1 })).resolves.toEqual(["Box A"]);
    });
  });

  describe("staying right while the inventory changes", () => {
    it("stops finding an item by its old name once it is renamed", async () => {
      const box = await unit("Box 3");
      const drill = await item("Cordless drill", box.id);

      await items.save({ ...drill, name: "Angle grinder" });

      await expect(itemNames("drill")).resolves.toEqual([]);
      await expect(itemNames("grinder")).resolves.toEqual(["Angle grinder"]);
    });

    it("stops finding an item by a tag that was taken off it", async () => {
      const box = await unit("Box 3");
      const hdmi = await item("HDMI 2.1", box.id, { tags: ["cables"] });

      await items.save({ ...hdmi, tags: ["video"] });

      await expect(itemNames("cables")).resolves.toEqual([]);
      await expect(itemNames("video")).resolves.toEqual(["HDMI 2.1"]);
    });

    it("answers with the new breadcrumb once an item is moved", async () => {
      const garage = await unit("Garage");
      const kitchen = await unit("Kitchen");
      const drill = await item("Cordless drill", garage.id);

      await moveItems.execute({
        itemIds: [drill.id as ItemId],
        targetUnitId: kitchen.id,
      });

      const [result] = (await search("drill")).items;

      expect(formatStorageUnitPath(result?.path ?? [])).toBe("Kitchen");
    });

    it("stops finding an item once it is deleted", async () => {
      const box = await unit("Box 3");
      const drill = await item("Cordless drill", box.id);

      await items.delete(drill.id);

      await expect(itemNames("drill")).resolves.toEqual([]);
    });

    it("stops finding a unit once it is deleted", async () => {
      const box = await unit("Wooden crate");

      await storageUnits.delete(box.id);

      await expect(unitNames("crate")).resolves.toEqual([]);
    });
  });
});
