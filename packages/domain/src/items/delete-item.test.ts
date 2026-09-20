import { beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { itemId, photoId } from "../shared/identity.js";
import { CreateStorageUnit } from "../storage-units/create-storage-unit.js";
import { StorageUnitKind } from "../storage-units/storage-unit.js";
import { InMemoryStorageUnitRepository } from "../storage-units/storage-unit-repository.fake.js";
import { CreateItem } from "./create-item.js";
import { DeleteItem } from "./delete-item.js";
import { ItemNotFound } from "./item-errors.js";
import { InMemoryItemRepository } from "./item-repository.fake.js";

describe("DeleteItem", () => {
  let items: InMemoryItemRepository;
  let storageUnits: InMemoryStorageUnitRepository;
  let createStorageUnit: CreateStorageUnit;
  let createItem: CreateItem;
  let deleteItem: DeleteItem;

  beforeEach(() => {
    items = new InMemoryItemRepository();
    storageUnits = new InMemoryStorageUnitRepository();
    const clock = new FakeClock(new Date("2026-01-01T10:00:00.000Z"));
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
    deleteItem = new DeleteItem({ items });
  });

  const createBox = async () =>
    createStorageUnit.execute({ name: "Box 3", kind: StorageUnitKind.BOX });

  it("deletes the item unconditionally", async () => {
    const box = await createBox();
    const drill = await createItem.execute({
      storageUnitId: box.id,
      name: "Cordless drill",
    });

    await deleteItem.execute(drill.id);

    await expect(items.findById(drill.id)).resolves.toBeNull();
  });

  it("reports the photos the caller must now release", async () => {
    const box = await createBox();
    const drill = await createItem.execute({
      storageUnitId: box.id,
      name: "Cordless drill",
      photos: [photoId("photo-a"), photoId("photo-b")],
    });

    const result = await deleteItem.execute(drill.id);

    expect(result.releasedPhotoIds).toEqual(["photo-a", "photo-b"]);
  });

  it("reports no photos to release when the item had none", async () => {
    const box = await createBox();
    const drill = await createItem.execute({
      storageUnitId: box.id,
      name: "Cordless drill",
    });

    const result = await deleteItem.execute(drill.id);

    expect(result.releasedPhotoIds).toEqual([]);
  });

  it("leaves the other items in the unit alone", async () => {
    const box = await createBox();
    const drill = await createItem.execute({
      storageUnitId: box.id,
      name: "Cordless drill",
    });
    await createItem.execute({ storageUnitId: box.id, name: "Drill bits" });

    await deleteItem.execute(drill.id);

    await expect(items.countByStorageUnit(box.id)).resolves.toBe(1);
  });

  it("rejects deleting an item that does not exist", async () => {
    await expect(deleteItem.execute(itemId("ghost"))).rejects.toBeInstanceOf(
      ItemNotFound,
    );
  });
});
