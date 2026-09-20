import {
  reparentStorageUnit,
  StorageUnitKind,
  unitId,
  type StorageUnitRepository,
} from "@ariadna/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  A_LATER_MOMENT,
  aChainOfStorageUnits,
  aPhotoId,
  aStorageUnit,
  sortedIds,
} from "./builders.js";
import type {
  RepositoryHarness,
  StorageUnitRepositoryContext,
} from "./harness.js";

/**
 * The behaviour EVERY `StorageUnitRepository` owes its callers, whatever sits
 * behind it. The in-memory repository and the Prisma one run this exact suite,
 * because a port is only worth having if the fake the domain is tested against
 * and the adapter shipped to production are indistinguishable from the outside.
 */
export const storageUnitRepositoryContract = (
  harness: RepositoryHarness<StorageUnitRepositoryContext>,
): void => {
  describe(`StorageUnitRepository contract (${harness.name})`, () => {
    let context: StorageUnitRepositoryContext;
    let storageUnits: StorageUnitRepository;

    beforeEach(async () => {
      context = await harness.setUp();
      storageUnits = context.storageUnits;
    });

    afterEach(async () => {
      await harness.tearDown();
    });

    describe("findById", () => {
      it("returns null for an id nobody stored", async () => {
        await expect(storageUnits.findById(unitId("ghost"))).resolves.toBeNull();
      });

      it("returns a saved root unit field for field", async () => {
        const room = aStorageUnit("room", {
          name: "Storage room",
          kind: StorageUnitKind.ROOM,
        });

        await storageUnits.save(room);

        await expect(storageUnits.findById(room.id)).resolves.toEqual(room);
      });

      it("round-trips a description, a cover photo id and a parent", async () => {
        const room = aStorageUnit("room", { kind: StorageUnitKind.ROOM });
        const box = aStorageUnit("box", {
          parentId: room.id,
          name: "Box 3",
          description: "Winter clothes, top shelf",
          photoId: aPhotoId("photo-7"),
        });

        await storageUnits.saveAll([room, box]);

        await expect(storageUnits.findById(box.id)).resolves.toEqual(box);
      });

      it("round-trips every storage unit kind", async () => {
        const kinds = Object.values(StorageUnitKind);
        const units = kinds.map((kind, index) =>
          aStorageUnit(`unit-${index}`, { kind }),
        );

        await storageUnits.saveAll(units);

        for (const unit of units) {
          await expect(storageUnits.findById(unit.id)).resolves.toEqual(unit);
        }
      });

      it("keeps timestamps to the millisecond", async () => {
        const unit = aStorageUnit("unit");

        await storageUnits.save(unit);
        const found = await storageUnits.findById(unit.id);

        expect(found?.createdAt.toISOString()).toBe(unit.createdAt.toISOString());
        expect(found?.updatedAt.toISOString()).toBe(unit.updatedAt.toISOString());
      });
    });

    describe("save", () => {
      it("replaces an existing unit instead of storing it twice", async () => {
        const unit = aStorageUnit("unit", { name: "Old name" });
        await storageUnits.save(unit);

        const renamed = { ...unit, name: "New name", updatedAt: A_LATER_MOMENT };
        await storageUnits.save(renamed);

        await expect(storageUnits.findById(unit.id)).resolves.toEqual(renamed);
      });

      it("moves a unit under a new parent", async () => {
        const [room, wardrobe] = aChainOfStorageUnits("room", "wardrobe");
        const garage = aStorageUnit("garage", { kind: StorageUnitKind.ROOM });
        await storageUnits.saveAll([room!, wardrobe!, garage]);

        await storageUnits.save(
          reparentStorageUnit(wardrobe!, garage.id, A_LATER_MOMENT),
        );

        const moved = await storageUnits.findById(wardrobe!.id);
        expect(moved?.parentId).toBe(garage.id);
        await expect(storageUnits.findChildren(room!.id)).resolves.toEqual([]);
      });

      it("detaches a unit back to a root", async () => {
        const [room, wardrobe] = aChainOfStorageUnits("room", "wardrobe");
        await storageUnits.saveAll([room!, wardrobe!]);

        await storageUnits.save(
          reparentStorageUnit(wardrobe!, null, A_LATER_MOMENT),
        );

        const detached = await storageUnits.findById(wardrobe!.id);
        expect(detached?.parentId).toBeNull();
        await expect(storageUnits.findAncestors(wardrobe!.id)).resolves.toEqual(
          [],
        );
      });
    });

    describe("saveAll", () => {
      it("persists every unit of the batch", async () => {
        const units = aChainOfStorageUnits("a", "b", "c");

        await storageUnits.saveAll(units);

        for (const unit of units) {
          await expect(storageUnits.findById(unit.id)).resolves.toEqual(unit);
        }
      });

      it("accepts an empty batch without complaining", async () => {
        await expect(storageUnits.saveAll([])).resolves.toBeUndefined();
      });
    });

    describe("delete", () => {
      it("removes the unit", async () => {
        const unit = aStorageUnit("unit");
        await storageUnits.save(unit);

        await storageUnits.delete(unit.id);

        await expect(storageUnits.findById(unit.id)).resolves.toBeNull();
      });

      it("treats deleting an unknown id as a no-op", async () => {
        await expect(
          storageUnits.delete(unitId("ghost")),
        ).resolves.toBeUndefined();
      });
    });

    describe("findAll", () => {
      it("returns nothing when nothing is stored", async () => {
        await expect(storageUnits.findAll()).resolves.toEqual([]);
      });

      it("returns every unit at every depth, roots included", async () => {
        const chain = aChainOfStorageUnits("room", "wardrobe", "box");
        const garage = aStorageUnit("garage", { kind: StorageUnitKind.ROOM });
        await storageUnits.saveAll([...chain, garage]);

        const all = await storageUnits.findAll();

        expect(sortedIds(all)).toEqual(["box", "garage", "room", "wardrobe"]);
      });

      it("returns whole units, not just their ids", async () => {
        const box = aStorageUnit("box", {
          name: "Box 3",
          description: "Winter clothes",
          photoId: aPhotoId("photo-7"),
        });
        await storageUnits.save(box);

        await expect(storageUnits.findAll()).resolves.toEqual([box]);
      });

      it("forgets a deleted unit", async () => {
        const box = aStorageUnit("box");
        await storageUnits.save(box);
        await storageUnits.delete(box.id);

        await expect(storageUnits.findAll()).resolves.toEqual([]);
      });
    });

    describe("findChildren", () => {
      it("returns the direct children only", async () => {
        const room = aStorageUnit("room", { kind: StorageUnitKind.ROOM });
        const boxA = aStorageUnit("box-a", { parentId: room.id });
        const boxB = aStorageUnit("box-b", { parentId: room.id });
        await storageUnits.saveAll([room, boxA, boxB]);

        const children = await storageUnits.findChildren(room.id);

        expect(sortedIds(children)).toEqual(["box-a", "box-b"]);
      });

      it("never reaches down to grandchildren", async () => {
        const [room, wardrobe, box] = aChainOfStorageUnits(
          "room",
          "wardrobe",
          "box",
        );
        await storageUnits.saveAll([room!, wardrobe!, box!]);

        const children = await storageUnits.findChildren(room!.id);

        expect(sortedIds(children)).toEqual(["wardrobe"]);
      });

      it("returns an empty list for a leaf", async () => {
        const unit = aStorageUnit("leaf");
        await storageUnits.save(unit);

        await expect(storageUnits.findChildren(unit.id)).resolves.toEqual([]);
      });

      it("never returns roots, whose parent is null rather than the queried id", async () => {
        const room = aStorageUnit("room", { kind: StorageUnitKind.ROOM });
        const otherRoot = aStorageUnit("garage", { kind: StorageUnitKind.ROOM });
        await storageUnits.saveAll([room, otherRoot]);

        await expect(storageUnits.findChildren(room.id)).resolves.toEqual([]);
      });

      it("returns children field for field", async () => {
        const room = aStorageUnit("room", { kind: StorageUnitKind.ROOM });
        const box = aStorageUnit("box", {
          parentId: room.id,
          description: "Cables",
        });
        await storageUnits.saveAll([room, box]);

        await expect(storageUnits.findChildren(room.id)).resolves.toEqual([box]);
      });
    });

    describe("countChildren", () => {
      it("counts the direct children only", async () => {
        const [room, wardrobe, box] = aChainOfStorageUnits(
          "room",
          "wardrobe",
          "box",
        );
        const shelf = aStorageUnit("shelf", { parentId: room!.id });
        await storageUnits.saveAll([room!, wardrobe!, box!, shelf]);

        await expect(storageUnits.countChildren(room!.id)).resolves.toBe(2);
      });

      it("returns zero for a leaf", async () => {
        const unit = aStorageUnit("leaf");
        await storageUnits.save(unit);

        await expect(storageUnits.countChildren(unit.id)).resolves.toBe(0);
      });

      it("returns zero for an unknown id", async () => {
        await expect(storageUnits.countChildren(unitId("ghost"))).resolves.toBe(
          0,
        );
      });
    });

    describe("findAncestors", () => {
      it("returns an empty chain for a root", async () => {
        const root = aStorageUnit("root", { kind: StorageUnitKind.ROOM });
        await storageUnits.save(root);

        await expect(storageUnits.findAncestors(root.id)).resolves.toEqual([]);
      });

      it("returns an empty chain for an unknown id", async () => {
        await expect(
          storageUnits.findAncestors(unitId("ghost")),
        ).resolves.toEqual([]);
      });

      it("returns the chain nearest first, root last", async () => {
        const [room, wardrobe, box] = aChainOfStorageUnits(
          "room",
          "wardrobe",
          "box",
        );
        await storageUnits.saveAll([room!, wardrobe!, box!]);

        const ancestors = await storageUnits.findAncestors(box!.id);

        expect(ancestors.map((unit) => unit.id)).toEqual(["wardrobe", "room"]);
      });

      it("returns ancestors field for field", async () => {
        const [room, box] = aChainOfStorageUnits("room", "box");
        await storageUnits.saveAll([room!, box!]);

        await expect(storageUnits.findAncestors(box!.id)).resolves.toEqual([
          room,
        ]);
      });

      it("ignores siblings and unrelated branches", async () => {
        const [room, wardrobe, box] = aChainOfStorageUnits(
          "room",
          "wardrobe",
          "box",
        );
        const sibling = aStorageUnit("sibling", { parentId: wardrobe!.id });
        const otherTree = aChainOfStorageUnits("garage", "crate");
        await storageUnits.saveAll([
          room!,
          wardrobe!,
          box!,
          sibling,
          ...otherTree,
        ]);

        const ancestors = await storageUnits.findAncestors(box!.id);

        expect(ancestors.map((unit) => unit.id)).toEqual(["wardrobe", "room"]);
      });

      it("walks a deep chain without losing a level", async () => {
        const ids = Array.from({ length: 12 }, (_, level) => `level-${level}`);
        const chain = aChainOfStorageUnits(...ids);
        await storageUnits.saveAll(chain);

        const deepest = chain.at(-1)!;
        const ancestors = await storageUnits.findAncestors(deepest.id);

        expect(ancestors.map((unit) => unit.id)).toEqual(
          ids.slice(0, -1).reverse(),
        );
      });

      /**
       * ADR 2 is the reason this port exists at all. If corrupt data ever
       * closes a loop, walking it must FAIL, never spin. A repository that
       * hangs here takes the whole API process with it.
       */
      it("rejects a stored one-node cycle instead of looping forever", async () => {
        const unit = aStorageUnit("self");
        await storageUnits.save(unit);
        await context.forceParentLink(unit.id, unit.id);

        await expect(storageUnits.findAncestors(unit.id)).rejects.toThrow();
      });

      it("rejects a stored three-node cycle instead of looping forever", async () => {
        const [room, wardrobe, box] = aChainOfStorageUnits(
          "room",
          "wardrobe",
          "box",
        );
        await storageUnits.saveAll([room!, wardrobe!, box!]);
        await context.forceParentLink(room!.id, box!.id);

        await expect(storageUnits.findAncestors(room!.id)).rejects.toThrow();
      });

      it("rejects a cycle reached from outside the loop", async () => {
        const [room, wardrobe, box] = aChainOfStorageUnits(
          "room",
          "wardrobe",
          "box",
        );
        const leaf = aStorageUnit("leaf", { parentId: box!.id });
        await storageUnits.saveAll([room!, wardrobe!, box!, leaf]);
        await context.forceParentLink(room!.id, box!.id);

        await expect(storageUnits.findAncestors(leaf.id)).rejects.toThrow();
      });
    });
  });
};
