import { beforeEach, describe, expect, it } from "vitest";

import { resolveAccess, Role, ShareLevel, type Access } from "../access/access.js";
import { CreateItem } from "../items/create-item.js";
import { InMemoryItemRepository } from "../items/item-repository.fake.js";
import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { unitId, userId, type UnitId } from "../shared/identity.js";
import { CreateStorageUnit } from "./create-storage-unit.js";
import { GetStorageUnit } from "./get-storage-unit.js";
import { StorageUnitNotFound } from "./storage-unit-errors.js";
import { StorageUnitKind } from "./storage-unit.js";
import { InMemoryStorageUnitRepository } from "./storage-unit-repository.fake.js";

describe("GetStorageUnit", () => {
  let storageUnits: InMemoryStorageUnitRepository;
  let createStorageUnit: CreateStorageUnit;
  let createItem: CreateItem;
  let getStorageUnit: GetStorageUnit;

  const create = async (name: string, owner: string, parentId: UnitId | null = null) =>
    createStorageUnit.execute({
      callerId: userId(owner),
      parentId,
      name,
      kind: StorageUnitKind.OTHER,
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
    getStorageUnit = new GetStorageUnit({ storageUnits, items });
  });

  it("answers with the space, its breadcrumb, what it holds and the spaces inside it", async () => {
    const garage = await create("Garage", "ana");
    const shelf = await create("Shelf", "ana", garage.id);
    await create("Box", "ana", shelf.id);
    await createItem.execute({ storageUnitId: shelf.id, name: "Drill" });

    const seen = await getStorageUnit.execute(await accessOf("ana"), shelf.id);

    expect(seen.unit.name).toBe("Shelf");
    expect(seen.path.map((unit) => unit.name)).toEqual(["Garage", "Shelf"]);
    expect(seen.children.map((unit) => unit.name)).toEqual(["Box"]);
    expect(seen.items.map((item) => item.name)).toEqual(["Drill"]);
  });

  it("cuts the breadcrumb at the space shared with the person", async () => {
    const garage = await create("Garage", "ana");
    const shelf = await create("Shelf", "ana", garage.id);
    const box = await create("Box", "ana", shelf.id);

    const seen = await getStorageUnit.execute(await accessOf("bea", [shelf.id]), box.id);

    expect(seen.path.map((unit) => unit.name)).toEqual(["Shelf", "Box"]);
  });

  it("treats a space the person may not see as one that does not exist", async () => {
    const garage = await create("Garage", "ana");

    await expect(
      getStorageUnit.execute(await accessOf("bea"), garage.id),
    ).rejects.toBeInstanceOf(StorageUnitNotFound);
  });

  it("says a space that does not exist does not exist", async () => {
    await expect(
      getStorageUnit.execute({ kind: "everything" }, unitId("ghost")),
    ).rejects.toBeInstanceOf(StorageUnitNotFound);
  });
});
