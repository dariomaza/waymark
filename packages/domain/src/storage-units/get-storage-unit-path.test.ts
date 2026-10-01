import { beforeEach, describe, expect, it } from "vitest";

import { resolveAccess, Role, ShareLevel, type Access } from "../access/access.js";

import { FakeClock } from "../shared/clock.fake.js";
import {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "../shared/id-generator.fake.js";
import { unitId, type UnitId, userId } from "../shared/identity.js";
import { CreateStorageUnit } from "./create-storage-unit.js";
import {
  formatStorageUnitPath,
  GetStorageUnitPath,
} from "./get-storage-unit-path.js";
import { StorageUnitNotFound } from "./storage-unit-errors.js";
import { StorageUnitKind } from "./storage-unit.js";
import { InMemoryStorageUnitRepository } from "./storage-unit-repository.fake.js";

const EVERYTHING: Access = { kind: "everything" };

describe("GetStorageUnitPath", () => {
  let storageUnits: InMemoryStorageUnitRepository;
  let createStorageUnit: CreateStorageUnit;
  let getStorageUnitPath: GetStorageUnitPath;

  const create = async (
    name: string,
    parentId: UnitId | null = null,
    owner = "dario",
  ) =>
    createStorageUnit.execute({
      callerId: userId(owner),
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

    const path = await getStorageUnitPath.execute(EVERYTHING, room.id);

    expect(path.map((unit) => unit.name)).toEqual(["Storage room"]);
  });

  it("returns the breadcrumb from the root down to the unit", async () => {
    const room = await create("Storage room");
    const wardrobe = await create("Metal wardrobe", room.id);
    const box = await create("Box 3", wardrobe.id);

    const path = await getStorageUnitPath.execute(EVERYTHING, box.id);

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

    const path = await getStorageUnitPath.execute(EVERYTHING, box.id);

    expect(formatStorageUnitPath(path)).toBe(
      "Storage room > Metal wardrobe > Box 3",
    );
  });

  it("rejects asking for the path of a unit that does not exist", async () => {
    await expect(
      getStorageUnitPath.execute(EVERYTHING, unitId("ghost")),
    ).rejects.toBeInstanceOf(StorageUnitNotFound);
  });

  describe("for a person who may not see the whole tree (ADR 26)", () => {
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

    it("starts the breadcrumb at the space shared with them", async () => {
      const room = await create("Storage room");
      const wardrobe = await create("Metal wardrobe", room.id);
      const box = await create("Box 3", wardrobe.id);

      const path = await getStorageUnitPath.execute(
        await accessOf("marta", [wardrobe.id]),
        box.id,
      );

      expect(path.map((unit) => unit.name)).toEqual(["Metal wardrobe", "Box 3"]);
    });

    it("treats a space they may not see as one that does not exist", async () => {
      const room = await create("Storage room");

      await expect(
        getStorageUnitPath.execute(await accessOf("marta"), room.id),
      ).rejects.toBeInstanceOf(StorageUnitNotFound);
    });

    it("gives the owner the whole breadcrumb", async () => {
      const room = await create("Storage room", null, "marta");
      const box = await create("Box 3", room.id, "marta");

      const path = await getStorageUnitPath.execute(await accessOf("marta"), box.id);

      expect(path.map((unit) => unit.name)).toEqual(["Storage room", "Box 3"]);
    });
  });
});
