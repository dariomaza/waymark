import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaSearchRepository } from "./prisma-search-repository.js";
import { createTestDatabase, type TestDatabase } from "./testing/test-database.js";

/**
 * The search index is a hand-written migration, and `schema.prisma` cannot
 * express a virtual table or a trigger. That has one dangerous consequence:
 * `prisma migrate dev` compares the database against the schema, does not see
 * `ItemSearch` in it, and offers to DROP it. Accepting that would leave a
 * product whose search silently returns nothing, with no error anywhere.
 *
 * So the index is pinned here. If a future migration drops it, renames it,
 * loses a trigger or changes the tokenizer, this file goes red instead of the
 * feature going quiet.
 *
 * The last case is the one that matters most. It writes straight into the base
 * tables with raw SQL — past Prisma's model layer, past every adapter, past
 * every use case — and then searches. An index maintained by application code
 * could not possibly pass it; one maintained by triggers cannot fail it, which
 * is the entire argument for choosing triggers (ADR 11).
 */
describe("the search index", () => {
  let database: TestDatabase;
  let search: PrismaSearchRepository;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.destroy();
  });

  beforeEach(async () => {
    await database.reset();
    search = new PrismaSearchRepository(database.client);
  });

  const definitionOf = async (name: string): Promise<string> => {
    const rows = await database.client.$queryRaw<{ sql: string | null }[]>`
      SELECT "sql" FROM "sqlite_master" WHERE "name" = ${name}
    `;

    return rows[0]?.sql ?? "";
  };

  describe("the migration leaves it in place", () => {
    it.each(["ItemSearch", "StorageUnitSearch"])(
      "creates %s as an fts5 table",
      async (table) => {
        await expect(definitionOf(table)).resolves.toMatch(/USING fts5/iu);
      },
    );

    it.each(["ItemSearch", "StorageUnitSearch"])(
      "folds the accents out of %s, which is what makes camara find cámara",
      async (table) => {
        await expect(definitionOf(table)).resolves.toMatch(
          /unicode61 remove_diacritics 2/u,
        );
      },
    );

    it.each([
      "Item_search_insert",
      "Item_search_update",
      "Item_search_delete",
      "ItemTag_search_insert",
      "ItemTag_search_update",
      "ItemTag_search_delete",
      "StorageUnit_search_insert",
      "StorageUnit_search_update",
      "StorageUnit_search_delete",
    ])("keeps the %s trigger", async (trigger) => {
      const rows = await database.client.$queryRaw<{ name: string }[]>`
        SELECT "name" FROM "sqlite_master"
        WHERE "type" = 'trigger' AND "name" = ${trigger}
      `;

      expect(rows).toHaveLength(1);
    });
  });

  describe("a write that never touches an adapter", () => {
    const writeUnitDirectly = async (id: string, name: string): Promise<void> => {
      await database.client.$executeRaw`
        INSERT INTO "StorageUnit" ("id", "parentId", "name", "kind", "description", "photoId", "publicId", "createdAt", "updatedAt")
        VALUES (${id}, NULL, ${name}, 'BOX', NULL, NULL, ${`PUB-${id}`}, 0, 0)
      `;
    };

    const writeItemDirectly = async (
      id: string,
      unitId: string,
      name: string,
    ): Promise<void> => {
      await database.client.$executeRaw`
        INSERT INTO "Item" ("id", "storageUnitId", "name", "description", "quantity", "createdAt", "updatedAt")
        VALUES (${id}, ${unitId}, ${name}, NULL, 1, 0, 0)
      `;
    };

    it("is indexed when a unit is inserted behind the adapter's back", async () => {
      await writeUnitDirectly("unit", "Armario metálico");

      const found = await search.findStorageUnitsMatching(["metalico"]);

      expect(found.map((unit) => unit.name)).toEqual(["Armario metálico"]);
    });

    it("is indexed when an item is inserted behind the adapter's back", async () => {
      await writeUnitDirectly("unit", "Box 3");
      await writeItemDirectly("item", "unit", "Cámara réflex");

      const found = await search.findItemsMatching(["camara"]);

      expect(found.map((item) => item.name)).toEqual(["Cámara réflex"]);
    });

    it("is re-indexed when a raw UPDATE renames an item", async () => {
      await writeUnitDirectly("unit", "Box 3");
      await writeItemDirectly("item", "unit", "Cordless drill");

      await database.client
        .$executeRaw`UPDATE "Item" SET "name" = 'Angle grinder' WHERE "id" = 'item'`;

      await expect(search.findItemsMatching(["drill"])).resolves.toEqual([]);
      expect(
        (await search.findItemsMatching(["grinder"])).map((item) => item.name),
      ).toEqual(["Angle grinder"]);
    });

    it("is re-indexed when a raw INSERT adds a tag", async () => {
      await writeUnitDirectly("unit", "Box 3");
      await writeItemDirectly("item", "unit", "HDMI 2.1");

      await database.client.$executeRaw`
        INSERT INTO "ItemTag" ("itemId", "position", "tag") VALUES ('item', 0, 'cables')
      `;

      expect(
        (await search.findItemsMatching(["cables"])).map((item) => item.name),
      ).toEqual(["HDMI 2.1"]);
    });

    it("is cleared when a raw DELETE removes an item", async () => {
      await writeUnitDirectly("unit", "Box 3");
      await writeItemDirectly("item", "unit", "Cordless drill");

      await database.client.$executeRaw`DELETE FROM "Item" WHERE "id" = 'item'`;

      await expect(search.findItemsMatching(["drill"])).resolves.toEqual([]);
    });

    it("cannot be left behind by a transaction that rolled back", async () => {
      await writeUnitDirectly("unit", "Box 3");

      await expect(
        database.client.$transaction(async (transaction) => {
          await transaction.$executeRaw`
            INSERT INTO "Item" ("id", "storageUnitId", "name", "description", "quantity", "createdAt", "updatedAt")
            VALUES ('item', 'unit', 'Cordless drill', NULL, 1, 0, 0)
          `;
          throw new Error("the write is abandoned halfway");
        }),
      ).rejects.toThrow("the write is abandoned halfway");

      await expect(search.findItemsMatching(["drill"])).resolves.toEqual([]);
    });
  });
});
