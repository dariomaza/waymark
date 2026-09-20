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
import { MoveStorageUnit } from "./move-storage-unit.js";
import {
  CyclicStorageUnitMove,
  StorageUnitNotFound,
} from "./storage-unit-errors.js";
import { StorageUnitKind } from "./storage-unit.js";
import { InMemoryStorageUnitRepository } from "./storage-unit-repository.fake.js";

describe("MoveStorageUnit", () => {
  let storageUnits: InMemoryStorageUnitRepository;
  let clock: FakeClock;
  let createStorageUnit: CreateStorageUnit;
  let getStorageUnitPath: GetStorageUnitPath;
  let moveStorageUnit: MoveStorageUnit;

  const create = async (name: string, parentId: UnitId | null = null) =>
    createStorageUnit.execute({
      parentId,
      name,
      kind: StorageUnitKind.OTHER,
    });

  beforeEach(() => {
    storageUnits = new InMemoryStorageUnitRepository();
    clock = new FakeClock(new Date("2026-01-01T10:00:00.000Z"));
    createStorageUnit = new CreateStorageUnit({
      storageUnits,
      ids: new SequentialIdGenerator("unit"),
      publicIds: new SequentialPublicIdGenerator(),
      clock,
    });
    getStorageUnitPath = new GetStorageUnitPath({ storageUnits });
    moveStorageUnit = new MoveStorageUnit({ storageUnits, clock });
  });

  describe("the cycle rule", () => {
    it("rejects moving a unit into itself", async () => {
      const room = await create("Storage room");

      await expect(
        moveStorageUnit.execute({ id: room.id, targetParentId: room.id }),
      ).rejects.toBeInstanceOf(CyclicStorageUnitMove);
    });

    it("rejects moving a unit into its direct child", async () => {
      const room = await create("Storage room");
      const wardrobe = await create("Metal wardrobe", room.id);

      await expect(
        moveStorageUnit.execute({ id: room.id, targetParentId: wardrobe.id }),
      ).rejects.toBeInstanceOf(CyclicStorageUnitMove);
    });

    it("rejects the three-node cycle that a `parentId !== id` guard lets through", async () => {
      // Storage room -> Wardrobe -> Box. Moving Storage room into Box makes no
      // unit its own parent, so a direct-parent guard passes, yet all three
      // units lose every route to a root (ADR 2).
      const room = await create("Storage room");
      const wardrobe = await create("Wardrobe", room.id);
      const box = await create("Box", wardrobe.id);

      expect(box.id).not.toBe(room.id);

      await expect(
        moveStorageUnit.execute({ id: room.id, targetParentId: box.id }),
      ).rejects.toBeInstanceOf(CyclicStorageUnitMove);
    });

    it("rejects moving a unit into a descendant four levels below it", async () => {
      const room = await create("Storage room");
      const wardrobe = await create("Wardrobe", room.id);
      const shelf = await create("Shelf", wardrobe.id);
      const box = await create("Box", shelf.id);
      const bag = await create("Bag", box.id);

      await expect(
        moveStorageUnit.execute({ id: room.id, targetParentId: bag.id }),
      ).rejects.toBeInstanceOf(CyclicStorageUnitMove);
    });

    it("leaves the tree untouched when it rejects a cyclic move", async () => {
      const room = await create("Storage room");
      const wardrobe = await create("Wardrobe", room.id);
      const box = await create("Box", wardrobe.id);

      await expect(
        moveStorageUnit.execute({ id: room.id, targetParentId: box.id }),
      ).rejects.toBeInstanceOf(CyclicStorageUnitMove);

      await expect(storageUnits.findById(room.id)).resolves.toEqual(room);
    });

    it("allows moving a unit out to the root", async () => {
      const room = await create("Storage room");
      const wardrobe = await create("Wardrobe", room.id);

      const moved = await moveStorageUnit.execute({
        id: wardrobe.id,
        targetParentId: null,
      });

      expect(moved.parentId).toBeNull();
      await expect(storageUnits.findById(wardrobe.id)).resolves.toEqual(moved);
    });

    it("allows moving a unit into an unrelated subtree", async () => {
      const room = await create("Storage room");
      const wardrobe = await create("Wardrobe", room.id);
      const garage = await create("Garage");
      const rack = await create("Rack", garage.id);

      const moved = await moveStorageUnit.execute({
        id: wardrobe.id,
        targetParentId: rack.id,
      });

      expect(moved.parentId).toBe(rack.id);
    });

    it("allows moving a unit into its own ancestor", async () => {
      const room = await create("Storage room");
      const wardrobe = await create("Wardrobe", room.id);
      const box = await create("Box", wardrobe.id);

      const moved = await moveStorageUnit.execute({
        id: box.id,
        targetParentId: room.id,
      });

      expect(moved.parentId).toBe(room.id);
    });

    it("keeps the breadcrumb terminating and correct after a legal move", async () => {
      const room = await create("Storage room");
      const wardrobe = await create("Wardrobe", room.id);
      const box = await create("Box", wardrobe.id);
      const garage = await create("Garage");

      await moveStorageUnit.execute({
        id: wardrobe.id,
        targetParentId: garage.id,
      });

      const path = await getStorageUnitPath.execute(box.id);

      expect(formatStorageUnitPath(path)).toBe("Garage > Wardrobe > Box");
    });
  });

  describe("moving contents", () => {
    it("carries the whole subtree along with the moved unit", async () => {
      const room = await create("Storage room");
      const wardrobe = await create("Wardrobe", room.id);
      const box = await create("Box", wardrobe.id);
      const garage = await create("Garage");

      await moveStorageUnit.execute({
        id: wardrobe.id,
        targetParentId: garage.id,
      });

      const stored = await storageUnits.findById(box.id);
      expect(stored?.parentId).toBe(wardrobe.id);
      const path = await getStorageUnitPath.execute(box.id);
      expect(path.map((unit) => unit.name)).toEqual([
        "Garage",
        "Wardrobe",
        "Box",
      ]);
    });

    it("stamps the moved unit with the time of the move", async () => {
      const room = await create("Storage room");
      const garage = await create("Garage");
      clock.advanceTo(new Date("2026-05-05T09:00:00.000Z"));

      const moved = await moveStorageUnit.execute({
        id: room.id,
        targetParentId: garage.id,
      });

      expect(moved.updatedAt).toEqual(new Date("2026-05-05T09:00:00.000Z"));
      expect(moved.createdAt).toEqual(new Date("2026-01-01T10:00:00.000Z"));
    });
  });

  describe("missing units", () => {
    it("rejects moving a unit that does not exist", async () => {
      await expect(
        moveStorageUnit.execute({
          id: unitId("ghost"),
          targetParentId: null,
        }),
      ).rejects.toBeInstanceOf(StorageUnitNotFound);
    });

    it("rejects moving a unit into a parent that does not exist", async () => {
      const room = await create("Storage room");

      await expect(
        moveStorageUnit.execute({
          id: room.id,
          targetParentId: unitId("ghost"),
        }),
      ).rejects.toBeInstanceOf(StorageUnitNotFound);
    });
  });
});
