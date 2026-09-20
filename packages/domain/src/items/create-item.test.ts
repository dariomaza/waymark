import { beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { photoId, unitId } from "../shared/identity.js";
import { CreateStorageUnit } from "../storage-units/create-storage-unit.js";
import { StorageUnitNotFound } from "../storage-units/storage-unit-errors.js";
import { StorageUnitKind } from "../storage-units/storage-unit.js";
import { InMemoryStorageUnitRepository } from "../storage-units/storage-unit-repository.fake.js";
import { CreateItem } from "./create-item.js";
import { InvalidQuantity } from "./item-errors.js";
import { InMemoryItemRepository } from "./item-repository.fake.js";

describe("CreateItem", () => {
  let items: InMemoryItemRepository;
  let storageUnits: InMemoryStorageUnitRepository;
  let clock: FakeClock;
  let createStorageUnit: CreateStorageUnit;
  let createItem: CreateItem;

  const createUnit = async (name: string) =>
    createStorageUnit.execute({ name, kind: StorageUnitKind.BOX });

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
  });

  it("stores a new item inside its storage unit", async () => {
    const box = await createUnit("Box 3");

    const created = await createItem.execute({
      storageUnitId: box.id,
      name: "Cordless drill",
    });

    expect(created.id).toBe("item-1");
    expect(created.storageUnitId).toBe(box.id);
    await expect(items.findByStorageUnit(box.id)).resolves.toEqual([created]);
  });

  it("timestamps the item with the clock", async () => {
    const box = await createUnit("Box 3");
    clock.advanceTo(new Date("2026-04-04T08:00:00.000Z"));

    const created = await createItem.execute({
      storageUnitId: box.id,
      name: "Cordless drill",
    });

    expect(created.createdAt).toEqual(new Date("2026-04-04T08:00:00.000Z"));
  });

  it("stores one unit when no quantity is given", async () => {
    const box = await createUnit("Box 3");

    const created = await createItem.execute({
      storageUnitId: box.id,
      name: "Cordless drill",
    });

    expect(created.quantity).toBe(1);
  });

  it("keeps tags and photos in the order they were given", async () => {
    const box = await createUnit("Box 3");

    const created = await createItem.execute({
      storageUnitId: box.id,
      name: "Cordless drill",
      description: "18V, with two batteries",
      quantity: 2,
      tags: ["tools", "power"],
      photos: [photoId("photo-a"), photoId("photo-b")],
    });

    expect(created.description).toBe("18V, with two batteries");
    expect(created.quantity).toBe(2);
    expect(created.tags).toEqual(["tools", "power"]);
    expect(created.photos).toEqual(["photo-a", "photo-b"]);
  });

  it("rejects creating an item in a storage unit that does not exist", async () => {
    await expect(
      createItem.execute({
        storageUnitId: unitId("ghost"),
        name: "Cordless drill",
      }),
    ).rejects.toBeInstanceOf(StorageUnitNotFound);
  });

  it("rejects a quantity below one", async () => {
    const box = await createUnit("Box 3");

    await expect(
      createItem.execute({
        storageUnitId: box.id,
        name: "Cordless drill",
        quantity: 0,
      }),
    ).rejects.toBeInstanceOf(InvalidQuantity);
  });

  it("stores nothing when the quantity is rejected", async () => {
    const box = await createUnit("Box 3");

    await expect(
      createItem.execute({
        storageUnitId: box.id,
        name: "Cordless drill",
        quantity: 0,
      }),
    ).rejects.toBeInstanceOf(InvalidQuantity);

    await expect(items.countByStorageUnit(box.id)).resolves.toBe(0);
  });
});
