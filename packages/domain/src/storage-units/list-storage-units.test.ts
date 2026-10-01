import { beforeEach, describe, expect, it } from "vitest";

import { resolveAccess, Role, ShareLevel, type Access } from "../access/access.js";
import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { userId, type UnitId } from "../shared/identity.js";
import { CreateStorageUnit } from "./create-storage-unit.js";
import { ListStorageUnits } from "./list-storage-units.js";
import { StorageUnitKind } from "./storage-unit.js";
import { InMemoryStorageUnitRepository } from "./storage-unit-repository.fake.js";

describe("ListStorageUnits", () => {
  let storageUnits: InMemoryStorageUnitRepository;
  let createStorageUnit: CreateStorageUnit;
  let listStorageUnits: ListStorageUnits;

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

  const namesSeenWith = async (access: Access): Promise<string[]> =>
    (await listStorageUnits.execute(access)).map((unit) => unit.name).sort();

  beforeEach(() => {
    storageUnits = new InMemoryStorageUnitRepository();
    createStorageUnit = new CreateStorageUnit({
      storageUnits,
      ids: new SequentialIdGenerator("unit"),
      publicIds: new SequentialPublicIdGenerator(),
      clock: new FakeClock(new Date("2026-01-01T10:00:00.000Z")),
    });
    listStorageUnits = new ListStorageUnits({ storageUnits });
  });

  it("shows a person their own spaces and none of anybody else's", async () => {
    const garage = await create("Ana garage", "ana");
    await create("Ana shelf", "ana", garage.id);
    await create("Bea flat", "bea");

    expect(await namesSeenWith(await accessOf("ana"))).toEqual([
      "Ana garage",
      "Ana shelf",
    ]);
  });

  it("shows a shared inner space and what it holds, but not the space around it", async () => {
    const garage = await create("Ana garage", "ana");
    const shelf = await create("Ana shelf", "ana", garage.id);
    await create("Ana box", "ana", shelf.id);
    await create("Ana toolbox", "ana", garage.id);

    expect(await namesSeenWith(await accessOf("bea", [shelf.id]))).toEqual([
      "Ana box",
      "Ana shelf",
    ]);
  });

  it("shows an administrator every space there is", async () => {
    await create("Ana garage", "ana");
    await create("Bea flat", "bea");

    expect(await namesSeenWith({ kind: "everything" })).toEqual([
      "Ana garage",
      "Bea flat",
    ]);
  });
});
