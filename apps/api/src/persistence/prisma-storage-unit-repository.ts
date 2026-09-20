import type {
  StorageUnit,
  StorageUnitRepository,
  UnitId,
} from "@ariadna/domain";
import type { PrismaClient } from "@prisma/client";

import { CorruptStorageUnitHierarchy } from "./persistence-errors.js";
import {
  toDomainStorageUnit,
  toStorageUnitRow,
} from "./storage-unit-mapper.js";

/**
 * How many ancestors the walk is willing to accept before it declares the data
 * corrupt.
 *
 * ADR 1 puts real depth at 4-5 levels (house > room > wardrobe > shelf > box).
 * 64 leaves an order of magnitude of headroom for anything a human would
 * actually build, while keeping the recursive CTE strictly bounded: with this
 * cap in place the query CANNOT run away, whatever the table contains.
 */
export const MAX_STORAGE_UNIT_ANCESTOR_DEPTH = 64;

export class PrismaStorageUnitRepository implements StorageUnitRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: UnitId): Promise<StorageUnit | null> {
    const row = await this.prisma.storageUnit.findUnique({ where: { id } });

    return row === null ? null : toDomainStorageUnit(row);
  }

  async findAll(): Promise<StorageUnit[]> {
    const rows = await this.prisma.storageUnit.findMany();

    return rows.map(toDomainStorageUnit);
  }

  async findChildren(id: UnitId): Promise<StorageUnit[]> {
    const rows = await this.prisma.storageUnit.findMany({
      where: { parentId: id },
    });

    return rows.map(toDomainStorageUnit);
  }

  async countChildren(id: UnitId): Promise<number> {
    return this.prisma.storageUnit.count({ where: { parentId: id } });
  }

  /**
   * The chain from the direct parent up to the root, nearest first.
   *
   * This method carries the whole ADR 2 invariant: `MoveStorageUnit` decides
   * whether a move closes a loop by asking for the target's ancestors. A naive
   * `while (parentId !== null)` loop in JavaScript would issue one round trip
   * per level AND spin forever on corrupt data, so the walk happens inside a
   * single recursive CTE with an explicit depth cap.
   *
   * Two independent guards, because either one alone is not enough:
   *
   * 1. The CTE's `depth <= MAX` predicate bounds the RECURSION itself. Even a
   *    cycle produces at most `MAX + 1` rows and the query always terminates.
   *    This is what makes "never hang" a property of the SQL rather than a hope.
   * 2. The result is then checked for a repeated id and for overflowing the cap.
   *    Both mean the same thing — this is not a tree — and both raise
   *    `CorruptStorageUnitHierarchy` rather than returning a plausible looking
   *    truncated breadcrumb, which is the genuinely dangerous outcome: a path
   *    silently missing its root looks completely valid to a caller.
   *
   * The CTE selects ids only and the rows are hydrated with a second query.
   * SQLite carries no column type through a CTE, so decoding timestamps out of
   * a raw result would mean re-implementing Prisma's value mapping by hand; at
   * a depth of four or five, one extra indexed lookup is a far better trade
   * than a second, subtly different mapper.
   */
  async findAncestors(id: UnitId): Promise<StorageUnit[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE "ancestor"("id", "parentId", "depth") AS (
        SELECT "parent"."id", "parent"."parentId", 1
        FROM "StorageUnit" AS "start"
        JOIN "StorageUnit" AS "parent" ON "parent"."id" = "start"."parentId"
        WHERE "start"."id" = ${id}

        UNION ALL

        SELECT "next"."id", "next"."parentId", "ancestor"."depth" + 1
        FROM "ancestor"
        JOIN "StorageUnit" AS "next" ON "next"."id" = "ancestor"."parentId"
        WHERE "ancestor"."depth" <= ${MAX_STORAGE_UNIT_ANCESTOR_DEPTH}
      )
      SELECT "id" FROM "ancestor" ORDER BY "depth" ASC
    `;

    const orderedIds = rows.map((row) => row.id);
    this.#assertIsAWalkableChain(id, orderedIds);

    if (orderedIds.length === 0) {
      return [];
    }

    const units = await this.prisma.storageUnit.findMany({
      where: { id: { in: orderedIds } },
    });
    const byId = new Map(units.map((unit) => [unit.id, unit]));

    return orderedIds.flatMap((ancestorId) => {
      const row = byId.get(ancestorId);
      return row === undefined ? [] : [toDomainStorageUnit(row)];
    });
  }

  async save(unit: StorageUnit): Promise<void> {
    const row = toStorageUnitRow(unit);

    await this.prisma.storageUnit.upsert({
      where: { id: unit.id },
      create: row,
      update: row,
    });
  }

  async saveAll(units: readonly StorageUnit[]): Promise<void> {
    if (units.length === 0) {
      return;
    }

    // One transaction: a batch move (ADR 3's "empty into parent") must not be
    // able to leave half of a subtree reparented.
    await this.prisma.$transaction(
      units.map((unit) => {
        const row = toStorageUnitRow(unit);
        return this.prisma.storageUnit.upsert({
          where: { id: unit.id },
          create: row,
          update: row,
        });
      }),
    );
  }

  async delete(id: UnitId): Promise<void> {
    // `deleteMany`, not `delete`: the port promises that removing something
    // that is not there is a no-op, and `delete` would throw instead.
    await this.prisma.storageUnit.deleteMany({ where: { id } });
  }

  #assertIsAWalkableChain(
    id: UnitId,
    orderedIds: readonly string[],
  ): void {
    const seen = new Set<string>([id]);

    for (const ancestorId of orderedIds) {
      if (seen.has(ancestorId)) {
        throw new CorruptStorageUnitHierarchy(
          id,
          `unit ${ancestorId} appears twice in its own ancestor chain, so the chain is a cycle`,
        );
      }
      seen.add(ancestorId);
    }

    if (orderedIds.length > MAX_STORAGE_UNIT_ANCESTOR_DEPTH) {
      throw new CorruptStorageUnitHierarchy(
        id,
        `the ancestor chain is deeper than the ${MAX_STORAGE_UNIT_ANCESTOR_DEPTH} level limit`,
      );
    }
  }
}
