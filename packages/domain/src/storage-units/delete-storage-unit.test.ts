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
import {
  StorageUnitNotEmpty,
  StorageUnitNotFound,
} from "./storage-unit-errors.js";
import { StorageUnitKind } from "./storage-unit.js";
import { InMemoryStorageUnitRepository } from "./storage-unit-repository.fake.js";

describe("DeleteStorageUnit", () => {
  let items: InMemoryItemRepository;
  let storageUnits: InMemoryStorageUnitRepository;
  let createStorageUnit: CreateStorageUnit;
  let createItem: CreateItem;
  let deleteStorageUnit: DeleteStorageUnit;

  const createUnit = async (name: string, parentId: UnitId | null = null) =>
    createStorageUnit.execute({
      parentId,
      name,
      kind: StorageUnitKind.OTHER,
    });

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
    deleteStorageUnit = new DeleteStorageUnit({ storageUnits, items });
  });

  it("deletes a unit that holds nothing", async () => {
    const box = await createUnit("Box 3");

    await deleteStorageUnit.execute(box.id);

    await expect(storageUnits.findById(box.id)).resolves.toBeNull();
  });

  it("refuses to delete a unit that holds items", async () => {
    const box = await createUnit("Box 3");
    await createItem.execute({
      storageUnitId: box.id,
      name: "Cordless drill",
    });

    await expect(deleteStorageUnit.execute(box.id)).rejects.toBeInstanceOf(
      StorageUnitNotEmpty,
    );
  });

  it("refuses to delete a unit that holds child units", async () => {
    const wardrobe = await createUnit("Metal wardrobe");
    await createUnit("Box 3", wardrobe.id);

    await expect(deleteStorageUnit.execute(wardrobe.id)).rejects.toBeInstanceOf(
      StorageUnitNotEmpty,
    );
  });

  it("refuses to delete a unit that holds both items and child units", async () => {
    const wardrobe = await createUnit("Metal wardrobe");
    await createUnit("Box 3", wardrobe.id);
    await createItem.execute({
      storageUnitId: wardrobe.id,
      name: "Loose screws",
    });

    await expect(deleteStorageUnit.execute(wardrobe.id)).rejects.toBeInstanceOf(
      StorageUnitNotEmpty,
    );
  });

  it("reports how much the unit still holds so the caller can offer to empty it", async () => {
    const wardrobe = await createUnit("Metal wardrobe");
    await createUnit("Box 3", wardrobe.id);
    await createUnit("Box 4", wardrobe.id);
    await createItem.execute({
      storageUnitId: wardrobe.id,
      name: "Loose screws",
    });

    await expect(deleteStorageUnit.execute(wardrobe.id)).rejects.toMatchObject({
      itemCount: 1,
      childUnitCount: 2,
    });
  });

  it("keeps the unit and its contents when it refuses", async () => {
    const wardrobe = await createUnit("Metal wardrobe");
    const box = await createUnit("Box 3", wardrobe.id);

    await expect(deleteStorageUnit.execute(wardrobe.id)).rejects.toBeInstanceOf(
      StorageUnitNotEmpty,
    );

    await expect(storageUnits.findById(wardrobe.id)).resolves.toEqual(wardrobe);
    await expect(storageUnits.findById(box.id)).resolves.toEqual(box);
  });

  it("never cascades: deleting a leaf leaves its parent untouched", async () => {
    const wardrobe = await createUnit("Metal wardrobe");
    const box = await createUnit("Box 3", wardrobe.id);

    await deleteStorageUnit.execute(box.id);

    await expect(storageUnits.findById(wardrobe.id)).resolves.toEqual(wardrobe);
  });

  it("rejects deleting a unit that does not exist", async () => {
    await expect(
      deleteStorageUnit.execute(unitId("ghost")),
    ).rejects.toBeInstanceOf(StorageUnitNotFound);
  });
});
