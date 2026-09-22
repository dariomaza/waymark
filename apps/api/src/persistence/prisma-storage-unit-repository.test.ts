import {
  DomainError,
  StorageUnitKind,
  createStorageUnit,
  publicId,
  unitId,
  type StorageUnit,
  type UnitId,
} from "@waymark/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CorruptStorageUnitHierarchy } from "./persistence-errors.js";
import {
  MAX_STORAGE_UNIT_ANCESTOR_DEPTH,
  PrismaStorageUnitRepository,
} from "./prisma-storage-unit-repository.js";
import { createTestDatabase, type TestDatabase } from "./testing/test-database.js";

/**
 * Behaviour that only a real database can have, so it cannot live in the
 * shared contract: raw SQL corruption, unique indexes, and the depth cap that
 * keeps the recursive CTE bounded.
 */

const NOW = new Date("2026-03-14T09:26:53.589Z");

const aUnit = (id: string, parentId: UnitId | null = null): StorageUnit =>
  createStorageUnit({
    id: unitId(id),
    parentId,
    name: `Unit ${id}`,
    kind: StorageUnitKind.BOX,
    publicId: publicId(`PUB-${id.toUpperCase()}`),
    now: NOW,
  });

/**
 * Fails the test if the promise has not settled in time, instead of letting
 * vitest's own timeout hide WHY: an unbounded ancestor walk does not throw, it
 * spins, and "the test timed out" is not the same finding as "it hung".
 */
const settlesWithin = async <T>(
  work: Promise<T>,
  milliseconds: number,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const alarm = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `findAncestors did not settle within ${milliseconds}ms: it is looping, not failing`,
          ),
        ),
      milliseconds,
    );
  });

  try {
    return await Promise.race([work, alarm]);
  } finally {
    clearTimeout(timer);
  }
};

describe("PrismaStorageUnitRepository against real SQLite", () => {
  let database: TestDatabase;
  let storageUnits: PrismaStorageUnitRepository;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.destroy();
  });

  beforeEach(async () => {
    await database.reset();
    storageUnits = new PrismaStorageUnitRepository(database.client);
  });

  /** Writes a parent link with raw SQL, bypassing the use cases entirely. */
  const forceParentLink = async (
    id: UnitId,
    parentId: UnitId,
  ): Promise<void> => {
    await database.client
      .$executeRaw`UPDATE "StorageUnit" SET "parentId" = ${parentId} WHERE "id" = ${id}`;
  };

  describe("findAncestors on corrupt data (ADR 2)", () => {
    it("fails loudly on a self-parenting unit instead of hanging", async () => {
      const unit = aUnit("self");
      await storageUnits.save(unit);
      await forceParentLink(unit.id, unit.id);

      await expect(
        settlesWithin(storageUnits.findAncestors(unit.id), 5_000),
      ).rejects.toBeInstanceOf(CorruptStorageUnitHierarchy);
    });

    it("fails loudly on the three-node cycle from ADR 2 instead of hanging", async () => {
      const room = aUnit("room");
      const wardrobe = aUnit("wardrobe", room.id);
      const box = aUnit("box", wardrobe.id);
      await storageUnits.saveAll([room, wardrobe, box]);

      // Exactly the move ADR 2 describes, written straight into the table:
      // room -> box -> wardrobe -> room, with no unit being its own parent.
      await forceParentLink(room.id, box.id);

      await expect(
        settlesWithin(storageUnits.findAncestors(room.id), 5_000),
      ).rejects.toBeInstanceOf(CorruptStorageUnitHierarchy);
    });

    it("fails loudly when the walk enters a cycle from outside it", async () => {
      const room = aUnit("room");
      const wardrobe = aUnit("wardrobe", room.id);
      const box = aUnit("box", wardrobe.id);
      const bag = aUnit("bag", box.id);
      await storageUnits.saveAll([room, wardrobe, box, bag]);
      await forceParentLink(room.id, box.id);

      await expect(
        settlesWithin(storageUnits.findAncestors(bag.id), 5_000),
      ).rejects.toBeInstanceOf(CorruptStorageUnitHierarchy);
    });

    it("raises a domain level error, not a driver error", async () => {
      const unit = aUnit("self");
      await storageUnits.save(unit);
      await forceParentLink(unit.id, unit.id);

      const failure = await storageUnits
        .findAncestors(unit.id)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(DomainError);
      expect((failure as Error).message).toContain(unit.id);
    });

    it("keeps the database usable after the failure", async () => {
      const unit = aUnit("self");
      const other = aUnit("other");
      await storageUnits.saveAll([unit, other]);
      await forceParentLink(unit.id, unit.id);

      await expect(storageUnits.findAncestors(unit.id)).rejects.toThrow();

      await expect(storageUnits.findById(other.id)).resolves.toEqual(other);
    });
  });

  describe("the depth cap", () => {
    it("walks a chain right up to the cap", async () => {
      const chain: StorageUnit[] = [];
      let parentId: UnitId | null = null;
      for (let level = 0; level < MAX_STORAGE_UNIT_ANCESTOR_DEPTH; level += 1) {
        const unit = aUnit(`level-${level}`, parentId);
        chain.push(unit);
        parentId = unit.id;
      }
      await storageUnits.saveAll(chain);

      const deepest = chain.at(-1)!;
      const ancestors = await storageUnits.findAncestors(deepest.id);

      expect(ancestors).toHaveLength(MAX_STORAGE_UNIT_ANCESTOR_DEPTH - 1);
      expect(ancestors.at(-1)?.id).toBe("level-0");
    });

    it("refuses to guess once a chain runs past the cap", async () => {
      const chain: StorageUnit[] = [];
      let parentId: UnitId | null = null;
      for (
        let level = 0;
        level < MAX_STORAGE_UNIT_ANCESTOR_DEPTH + 5;
        level += 1
      ) {
        const unit = aUnit(`level-${level}`, parentId);
        chain.push(unit);
        parentId = unit.id;
      }
      await storageUnits.saveAll(chain);

      const deepest = chain.at(-1)!;

      // Truncating silently would hand the caller a breadcrumb that is missing
      // its root and looks perfectly valid. ADR 1 puts real depth at 4-5.
      await expect(
        storageUnits.findAncestors(deepest.id),
      ).rejects.toBeInstanceOf(CorruptStorageUnitHierarchy);
    });
  });

  describe("storage level integrity the in-memory double does not claim", () => {
    it("rejects a second unit reusing a public id", async () => {
      const first = aUnit("first");
      const clash = {
        ...aUnit("second"),
        publicId: first.publicId,
      };
      await storageUnits.save(first);

      await expect(storageUnits.save(clash)).rejects.toThrow();
    });

    it("refuses to orphan a child by deleting its parent", async () => {
      const room = aUnit("room");
      const box = aUnit("box", room.id);
      await storageUnits.saveAll([room, box]);

      // ADR 3 forbids cascading deletes in the domain; the schema mirrors that
      // rather than quietly disagreeing with it.
      await expect(storageUnits.delete(room.id)).rejects.toThrow();
    });
  });
});
