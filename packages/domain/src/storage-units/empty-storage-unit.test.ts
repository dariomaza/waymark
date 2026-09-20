import { beforeEach, describe, expect, it } from "vitest";

import { CreateItem } from "../items/create-item.js";
import { InMemoryItemRepository } from "../items/item-repository.fake.js";
import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { unitId, type UnitId } from "../shared/identity.js";
import { CreateStorageUnit } from "./create-storage-unit.js";
import { DeleteStorageUnit } from "./delete-storage-unit.js";
import { EmptyStorageUnit } from "./empty-storage-unit.js";
import { GetStorageUnitPath } from "./get-storage-unit-path.js";
import {
  CyclicStorageUnitMove,
  MissingEmptyTarget,
  StorageUnitNotFound,
} from "./storage-unit-errors.js";
import { StorageUnitKind } from "./storage-unit.js";
import { InMemoryStorageUnitRepository } from "./storage-unit-repository.fake.js";

describe("EmptyStorageUnit", () => {
  let items: InMemoryItemRepository;
  let storageUnits: InMemoryStorageUnitRepository;
  let clock: FakeClock;
  let createStorageUnit: CreateStorageUnit;
  let createItem: CreateItem;
  let emptyStorageUnit: EmptyStorageUnit;
  let deleteStorageUnit: DeleteStorageUnit;
  let getStorageUnitPath: GetStorageUnitPath;

  const createUnit = async (name: string, parentId: UnitId | null = null) =>
    createStorageUnit.execute({
      parentId,
      name,
      kind: StorageUnitKind.OTHER,
    });

  beforeEach(() => {
    items = new InMemoryItemRepository();
    storageUnits = new InMemoryStorageUnitRepository();
    clock = new FakeClock(new Date("2026-01-01T10:00:00.000Z"));
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
    emptyStorageUnit = new EmptyStorageUnit({ storageUnits, items, clock });
    deleteStorageUnit = new DeleteStorageUnit({ storageUnits, items });
    getStorageUnitPath = new GetStorageUnitPath({ storageUnits });
  });

  describe("emptying into the parent", () => {
    it("moves the items up to the parent", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      await createItem.execute({
        storageUnitId: wardrobe.id,
        name: "Loose screws",
      });

      await emptyStorageUnit.execute(wardrobe.id);

      await expect(items.countByStorageUnit(wardrobe.id)).resolves.toBe(0);
      await expect(items.countByStorageUnit(room.id)).resolves.toBe(1);
    });

    it("moves the child units up to the parent", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      const box = await createUnit("Box 3", wardrobe.id);

      await emptyStorageUnit.execute(wardrobe.id);

      const stored = await storageUnits.findById(box.id);
      expect(stored?.parentId).toBe(room.id);
    });

    it("reports what it moved", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      await createUnit("Box 3", wardrobe.id);
      await createUnit("Box 4", wardrobe.id);
      await createItem.execute({
        storageUnitId: wardrobe.id,
        name: "Loose screws",
      });

      const result = await emptyStorageUnit.execute(wardrobe.id);

      expect(result.movedItems).toHaveLength(1);
      expect(result.movedChildUnits).toHaveLength(2);
    });

    it("lets the unit be deleted afterwards", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      await createUnit("Box 3", wardrobe.id);
      await createItem.execute({
        storageUnitId: wardrobe.id,
        name: "Loose screws",
      });

      await emptyStorageUnit.execute(wardrobe.id);
      await deleteStorageUnit.execute(wardrobe.id);

      await expect(storageUnits.findById(wardrobe.id)).resolves.toBeNull();
    });

    it("keeps the breadcrumb of the moved contents correct", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      const box = await createUnit("Box 3", wardrobe.id);

      await emptyStorageUnit.execute(wardrobe.id);

      const path = await getStorageUnitPath.execute(box.id);
      expect(path.map((unit) => unit.name)).toEqual(["Storage room", "Box 3"]);
    });

    it("turns the child units of a root into roots themselves", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);

      await emptyStorageUnit.execute(room.id);

      const stored = await storageUnits.findById(wardrobe.id);
      expect(stored?.parentId).toBeNull();
    });

    it("refuses to empty a root that holds items, because they have nowhere to go", async () => {
      const room = await createUnit("Storage room");
      await createItem.execute({
        storageUnitId: room.id,
        name: "Loose screws",
      });

      await expect(emptyStorageUnit.execute(room.id)).rejects.toBeInstanceOf(
        MissingEmptyTarget,
      );
    });

    it("moves nothing when it refuses to empty a root that holds items", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      await createItem.execute({
        storageUnitId: room.id,
        name: "Loose screws",
      });

      await expect(emptyStorageUnit.execute(room.id)).rejects.toBeInstanceOf(
        MissingEmptyTarget,
      );

      const stored = await storageUnits.findById(wardrobe.id);
      expect(stored?.parentId).toBe(room.id);
    });

    it("does nothing to a unit that is already empty", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);

      const result = await emptyStorageUnit.execute(wardrobe.id);

      expect(result.movedItems).toEqual([]);
      expect(result.movedChildUnits).toEqual([]);
    });
  });

  describe("emptying into an explicit target", () => {
    it("moves the items and child units into the target", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      const box = await createUnit("Box 3", wardrobe.id);
      const garage = await createUnit("Garage");
      await createItem.execute({
        storageUnitId: wardrobe.id,
        name: "Loose screws",
      });

      await emptyStorageUnit.execute(wardrobe.id, garage.id);

      await expect(items.countByStorageUnit(garage.id)).resolves.toBe(1);
      const stored = await storageUnits.findById(box.id);
      expect(stored?.parentId).toBe(garage.id);
    });

    it("stamps the moved contents with the time of the move", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      const box = await createUnit("Box 3", wardrobe.id);
      const drill = await createItem.execute({
        storageUnitId: wardrobe.id,
        name: "Cordless drill",
      });
      clock.advanceTo(new Date("2026-07-07T06:00:00.000Z"));

      await emptyStorageUnit.execute(wardrobe.id, room.id);

      const movedBox = await storageUnits.findById(box.id);
      const movedDrill = await items.findById(drill.id);
      expect(movedBox?.updatedAt).toEqual(new Date("2026-07-07T06:00:00.000Z"));
      expect(movedDrill?.updatedAt).toEqual(
        new Date("2026-07-07T06:00:00.000Z"),
      );
    });

    it("rejects emptying a unit into itself", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);

      await expect(
        emptyStorageUnit.execute(wardrobe.id, wardrobe.id),
      ).rejects.toBeInstanceOf(CyclicStorageUnitMove);
    });

    it("rejects emptying a unit into one of its own descendants", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      const box = await createUnit("Box 3", wardrobe.id);
      const bag = await createUnit("Bag", box.id);

      await expect(
        emptyStorageUnit.execute(wardrobe.id, bag.id),
      ).rejects.toBeInstanceOf(CyclicStorageUnitMove);
    });

    it("moves nothing when it rejects a cyclic target", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);
      const box = await createUnit("Box 3", wardrobe.id);

      await expect(
        emptyStorageUnit.execute(wardrobe.id, box.id),
      ).rejects.toBeInstanceOf(CyclicStorageUnitMove);

      const stored = await storageUnits.findById(box.id);
      expect(stored?.parentId).toBe(wardrobe.id);
    });

    it("rejects emptying a unit into a target that does not exist", async () => {
      const room = await createUnit("Storage room");
      const wardrobe = await createUnit("Metal wardrobe", room.id);

      await expect(
        emptyStorageUnit.execute(wardrobe.id, unitId("ghost")),
      ).rejects.toBeInstanceOf(StorageUnitNotFound);
    });

    it("rejects emptying a unit that does not exist", async () => {
      await expect(
        emptyStorageUnit.execute(unitId("ghost")),
      ).rejects.toBeInstanceOf(StorageUnitNotFound);
    });
  });
});
