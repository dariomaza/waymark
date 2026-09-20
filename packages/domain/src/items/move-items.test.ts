import { beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { itemId, unitId, type UnitId } from "../shared/identity.js";
import { CreateStorageUnit } from "../storage-units/create-storage-unit.js";
import { StorageUnitNotFound } from "../storage-units/storage-unit-errors.js";
import { StorageUnitKind } from "../storage-units/storage-unit.js";
import { InMemoryStorageUnitRepository } from "../storage-units/storage-unit-repository.fake.js";
import { CreateItem } from "./create-item.js";
import { ItemNotFound } from "./item-errors.js";
import { InMemoryItemRepository } from "./item-repository.fake.js";
import { MoveItems } from "./move-items.js";

describe("MoveItems", () => {
  let items: InMemoryItemRepository;
  let storageUnits: InMemoryStorageUnitRepository;
  let clock: FakeClock;
  let createStorageUnit: CreateStorageUnit;
  let createItem: CreateItem;
  let moveItems: MoveItems;

  const createUnit = async (name: string) =>
    createStorageUnit.execute({ name, kind: StorageUnitKind.BOX });

  const createItemIn = async (storageUnitId: UnitId, name: string) =>
    createItem.execute({ storageUnitId, name });

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
    moveItems = new MoveItems({ items, storageUnits, clock });
  });

  it("moves every given item into the target unit in one call", async () => {
    const box = await createUnit("Box 3");
    const crate = await createUnit("Crate 1");
    const drill = await createItemIn(box.id, "Cordless drill");
    const bits = await createItemIn(box.id, "Drill bits");

    const moved = await moveItems.execute({
      itemIds: [drill.id, bits.id],
      targetUnitId: crate.id,
    });

    expect(moved.map((item) => item.storageUnitId)).toEqual([
      crate.id,
      crate.id,
    ]);
    await expect(items.countByStorageUnit(box.id)).resolves.toBe(0);
    await expect(items.countByStorageUnit(crate.id)).resolves.toBe(2);
  });

  it("stamps the moved items with the time of the move", async () => {
    const box = await createUnit("Box 3");
    const crate = await createUnit("Crate 1");
    const drill = await createItemIn(box.id, "Cordless drill");
    clock.advanceTo(new Date("2026-06-06T07:00:00.000Z"));

    const [moved] = await moveItems.execute({
      itemIds: [drill.id],
      targetUnitId: crate.id,
    });

    expect(moved?.updatedAt).toEqual(new Date("2026-06-06T07:00:00.000Z"));
    expect(moved?.createdAt).toEqual(new Date("2026-01-01T10:00:00.000Z"));
  });

  it("does nothing when given no items", async () => {
    const crate = await createUnit("Crate 1");

    await expect(
      moveItems.execute({ itemIds: [], targetUnitId: crate.id }),
    ).resolves.toEqual([]);
  });

  it("rejects moving items into a unit that does not exist", async () => {
    const box = await createUnit("Box 3");
    const drill = await createItemIn(box.id, "Cordless drill");

    await expect(
      moveItems.execute({
        itemIds: [drill.id],
        targetUnitId: unitId("ghost"),
      }),
    ).rejects.toBeInstanceOf(StorageUnitNotFound);
  });

  it("rejects the whole move when one item does not exist", async () => {
    const box = await createUnit("Box 3");
    const crate = await createUnit("Crate 1");
    const drill = await createItemIn(box.id, "Cordless drill");

    await expect(
      moveItems.execute({
        itemIds: [drill.id, itemId("ghost")],
        targetUnitId: crate.id,
      }),
    ).rejects.toBeInstanceOf(ItemNotFound);
  });

  it("moves nothing when one item does not exist", async () => {
    const box = await createUnit("Box 3");
    const crate = await createUnit("Crate 1");
    const drill = await createItemIn(box.id, "Cordless drill");

    await expect(
      moveItems.execute({
        itemIds: [drill.id, itemId("ghost")],
        targetUnitId: crate.id,
      }),
    ).rejects.toBeInstanceOf(ItemNotFound);

    await expect(items.countByStorageUnit(box.id)).resolves.toBe(1);
    await expect(items.countByStorageUnit(crate.id)).resolves.toBe(0);
  });

  it("names the missing item in the error", async () => {
    const crate = await createUnit("Crate 1");

    await expect(
      moveItems.execute({
        itemIds: [itemId("ghost")],
        targetUnitId: crate.id,
      }),
    ).rejects.toMatchObject({ id: "ghost" });
  });

  it("leaves an item that is already in the target unit where it is", async () => {
    const crate = await createUnit("Crate 1");
    const drill = await createItemIn(crate.id, "Cordless drill");

    const [moved] = await moveItems.execute({
      itemIds: [drill.id],
      targetUnitId: crate.id,
    });

    expect(moved?.storageUnitId).toBe(crate.id);
    await expect(items.countByStorageUnit(crate.id)).resolves.toBe(1);
  });
});
