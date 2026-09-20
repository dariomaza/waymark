import { beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { unitId, type UnitId } from "../shared/identity.js";
import { CreateStorageUnit } from "./create-storage-unit.js";
import {
  formatStorageUnitPath,
  GetStorageUnitPath,
} from "./get-storage-unit-path.js";
import { StorageUnitNotFound } from "./storage-unit-errors.js";
import { StorageUnitKind } from "./storage-unit.js";
import { InMemoryStorageUnitRepository } from "./storage-unit-repository.fake.js";

describe("GetStorageUnitPath", () => {
  let storageUnits: InMemoryStorageUnitRepository;
  let createStorageUnit: CreateStorageUnit;
  let getStorageUnitPath: GetStorageUnitPath;

  const create = async (name: string, parentId: UnitId | null = null) =>
    createStorageUnit.execute({
      parentId,
      name,
      kind: StorageUnitKind.OTHER,
    });

  beforeEach(() => {
    storageUnits = new InMemoryStorageUnitRepository();
    createStorageUnit = new CreateStorageUnit({
      storageUnits,
      ids: new SequentialIdGenerator("unit"),
      publicIds: new SequentialPublicIdGenerator(),
      clock: new FakeClock(new Date("2026-01-01T10:00:00.000Z")),
    });
    getStorageUnitPath = new GetStorageUnitPath({ storageUnits });
  });

  it("returns only the unit itself for a root", async () => {
    const room = await create("Storage room");

    const path = await getStorageUnitPath.execute(room.id);

    expect(path.map((unit) => unit.name)).toEqual(["Storage room"]);
  });

  it("returns the breadcrumb from the root down to the unit", async () => {
    const room = await create("Storage room");
    const wardrobe = await create("Metal wardrobe", room.id);
    const box = await create("Box 3", wardrobe.id);

    const path = await getStorageUnitPath.execute(box.id);

    expect(path.map((unit) => unit.name)).toEqual([
      "Storage room",
      "Metal wardrobe",
      "Box 3",
    ]);
  });

  it("renders the breadcrumb as a readable location", async () => {
    const room = await create("Storage room");
    const wardrobe = await create("Metal wardrobe", room.id);
    const box = await create("Box 3", wardrobe.id);

    const path = await getStorageUnitPath.execute(box.id);

    expect(formatStorageUnitPath(path)).toBe(
      "Storage room > Metal wardrobe > Box 3",
    );
  });

  it("rejects asking for the path of a unit that does not exist", async () => {
    await expect(
      getStorageUnitPath.execute(unitId("ghost")),
    ).rejects.toBeInstanceOf(StorageUnitNotFound);
  });
});
