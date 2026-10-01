import { beforeEach, describe, expect, it } from "vitest";

import { resolveAccess, Role, ShareLevel, type Access } from "../access/access.js";
import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { itemId, userId, type UnitId } from "../shared/identity.js";
import { CreateStorageUnit } from "../storage-units/create-storage-unit.js";
import { StorageUnitKind } from "../storage-units/storage-unit.js";
import { InMemoryStorageUnitRepository } from "../storage-units/storage-unit-repository.fake.js";
import { CreateItem } from "./create-item.js";
import { GetItem } from "./get-item.js";
import { ItemNotFound } from "./item-errors.js";
import { InMemoryItemRepository } from "./item-repository.fake.js";

describe("GetItem", () => {
  let storageUnits: InMemoryStorageUnitRepository;
  let createStorageUnit: CreateStorageUnit;
  let createItem: CreateItem;
  let getItem: GetItem;

  const aUnit = async (name: string, owner: string, parentId: UnitId | null = null) =>
    createStorageUnit.execute({
      callerId: userId(owner),
      parentId,
      name,
      kind: StorageUnitKind.BOX,
    });

  const accessOf = async (
    who: string,
    shared: readonly UnitId[] = [],
  ): Promise<Access> =>
    resolveAccess({
      caller: { userId: userId(who), role: Role.USER },
      storageUnits: await storageUnits.findAll(),
      shares: shared.map((storageUnitId) => ({
        storageUnitId,
        userId: userId(who),
        access: ShareLevel.VIEW,
      })),
    });

  beforeEach(() => {
    storageUnits = new InMemoryStorageUnitRepository();
    const items = new InMemoryItemRepository();
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
    getItem = new GetItem({ items, storageUnits });
  });

  it("answers with the item and where it is, root first", async () => {
    const garage = await aUnit("Garage", "ana");
    const box = await aUnit("Box 3", "ana", garage.id);
    const drill = await createItem.execute({ storageUnitId: box.id, name: "Drill" });

    const seen = await getItem.execute(await accessOf("ana"), drill.id);

    expect(seen.item.name).toBe("Drill");
    expect(seen.path.map((unit) => unit.name)).toEqual(["Garage", "Box 3"]);
  });

  it("cuts the breadcrumb at the space shared with the person", async () => {
    const garage = await aUnit("Garage", "ana");
    const box = await aUnit("Box 3", "ana", garage.id);
    const drill = await createItem.execute({ storageUnitId: box.id, name: "Drill" });

    const seen = await getItem.execute(await accessOf("bea", [box.id]), drill.id);

    expect(seen.path.map((unit) => unit.name)).toEqual(["Box 3"]);
  });

  it("treats an item in a space the person may not see as one that does not exist", async () => {
    const garage = await aUnit("Garage", "ana");
    const drill = await createItem.execute({ storageUnitId: garage.id, name: "Drill" });

    await expect(
      getItem.execute(await accessOf("bea"), drill.id),
    ).rejects.toBeInstanceOf(ItemNotFound);
  });

  it("says an item that does not exist does not exist", async () => {
    await expect(
      getItem.execute({ kind: "everything" }, itemId("ghost")),
    ).rejects.toBeInstanceOf(ItemNotFound);
  });
});
