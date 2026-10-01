import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "./testing/test-database.js";

/**
 * # What the database itself refuses (ADR 26)
 *
 * A root has an owner and a space inside another has none. The domain keeps
 * that on every write it makes; these cases write raw SQL, past every adapter
 * and every use case, to prove the database keeps it too — the way the search
 * index is proven against raw writes in `search-index.test.ts`.
 *
 * Shares are pinned here as well: one per space and person, and gone with
 * either.
 */
describe("ownership and shares in the database", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.destroy();
  });

  beforeEach(async () => {
    await database.reset();
    for (const id of ["dario", "partner"]) {
      await database.client.$executeRawUnsafe(
        `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt")
         VALUES (?, ?, 'x', 0, 0)`,
        id,
        id,
      );
    }
  });

  const insertSpace = (id: string, parentId: string | null, ownerId: string | null) =>
    database.client.$executeRawUnsafe(
      `INSERT INTO "StorageUnit" ("id", "parentId", "ownerId", "name", "kind", "publicId", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, 'BOX', ?, 0, 0)`,
      id,
      parentId,
      ownerId,
      id,
      `PUB-${id}`,
    );

  const INVARIANT = /A root space has an owner and a space inside another has none/u;

  describe("a root has an owner and nothing else does", () => {
    it("accepts a root with an owner and a space inside it with none", async () => {
      await insertSpace("garage", null, "dario");
      await insertSpace("shelf", "garage", null);

      const count = await database.client.storageUnit.count();
      expect(count).toBe(2);
    });

    it("refuses a root with no owner", async () => {
      await expect(insertSpace("garage", null, null)).rejects.toThrow(INVARIANT);
    });

    it("refuses a space inside another that names an owner", async () => {
      await insertSpace("garage", null, "dario");

      await expect(insertSpace("shelf", "garage", "partner")).rejects.toThrow(
        INVARIANT,
      );
    });

    it("refuses taking a space to the top without saying whose it is", async () => {
      await insertSpace("garage", null, "dario");
      await insertSpace("shelf", "garage", null);

      await expect(
        database.client.$executeRawUnsafe(
          `UPDATE "StorageUnit" SET "parentId" = NULL WHERE "id" = 'shelf'`,
        ),
      ).rejects.toThrow(INVARIANT);
    });

    it("refuses putting a root inside another space while it keeps its owner", async () => {
      await insertSpace("house", null, "dario");
      await insertSpace("garage", null, "partner");

      await expect(
        database.client.$executeRawUnsafe(
          `UPDATE "StorageUnit" SET "parentId" = 'house' WHERE "id" = 'garage'`,
        ),
      ).rejects.toThrow(INVARIANT);
    });

    it("refuses taking the owner off a root", async () => {
      await insertSpace("garage", null, "dario");

      await expect(
        database.client.$executeRawUnsafe(
          `UPDATE "StorageUnit" SET "ownerId" = NULL WHERE "id" = 'garage'`,
        ),
      ).rejects.toThrow(INVARIANT);
    });

    it("refuses deleting an account that still owns an inventory", async () => {
      await insertSpace("garage", null, "dario");

      await expect(
        database.client.$executeRawUnsafe(`DELETE FROM "User" WHERE "id" = 'dario'`),
      ).rejects.toThrow();
    });
  });

  describe("a share", () => {
    const share = (storageUnitId: string, userId: string, access: string) =>
      database.client.$executeRawUnsafe(
        `INSERT INTO "Share" ("storageUnitId", "userId", "access") VALUES (?, ?, ?)`,
        storageUnitId,
        userId,
        access,
      );

    beforeEach(async () => {
      await insertSpace("garage", null, "dario");
      await insertSpace("shelf", "garage", null);
    });

    it("is one per space and person", async () => {
      await share("garage", "partner", "view");

      await expect(share("garage", "partner", "edit")).rejects.toThrow();
    });

    it("goes with the space it was on", async () => {
      await share("shelf", "partner", "edit");

      await database.client.$executeRawUnsafe(
        `DELETE FROM "StorageUnit" WHERE "id" = 'shelf'`,
      );

      expect(await database.client.share.count()).toBe(0);
    });

    it("goes with the person it was for", async () => {
      await share("shelf", "partner", "edit");

      await database.client.$executeRawUnsafe(
        `DELETE FROM "User" WHERE "id" = 'partner'`,
      );

      expect(await database.client.share.count()).toBe(0);
    });
  });
});
