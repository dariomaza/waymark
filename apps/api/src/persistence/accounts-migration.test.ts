import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildDatabaseMigratedThrough,
  type DatabaseInThePast,
} from "./testing/migrate-template.js";

/**
 * # The day ADR 26 is deployed onto a database written before it
 *
 * Each case stops a real database at the last migration before accounts had
 * roles and owners, writes into it in the shape it had then, and lets the real
 * migrator carry it forward. What the ADR promises is that everybody sees on
 * the day of the deploy what they saw the day before: the oldest account
 * becomes the administrator and owns everything that existed, and every other
 * account is given an edit share on every root.
 */
const BEFORE_ACCOUNTS = "20260923160000_add_passkeys";

let past: DatabaseInThePast | null = null;
let client: PrismaClient | null = null;

afterEach(async () => {
  await client?.$disconnect();
  await past?.dispose();
  client = null;
  past = null;
});

const aDatabaseFromBefore = async (): Promise<PrismaClient> => {
  past = await buildDatabaseMigratedThrough(BEFORE_ACCOUNTS);
  client = new PrismaClient({ datasourceUrl: `file:${past.file}` });
  return client;
};

const anAccount = async (
  db: PrismaClient,
  id: string,
  createdAt: string,
): Promise<void> => {
  await db.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt")
     VALUES (?, ?, 'scrypt$x', ?, ?)`,
    id,
    id,
    new Date(createdAt).getTime(),
    new Date(createdAt).getTime(),
  );
};

const aMachineToken = async (db: PrismaClient, name: string): Promise<void> => {
  await db.$executeRawUnsafe(
    `INSERT INTO "MachineToken" ("id", "name", "tokenHash", "scope", "createdAt")
     VALUES (?, ?, ?, 'read', 0)`,
    `token-${name}`,
    name,
    `hash-${name}`,
  );
};

const aSpace = async (
  db: PrismaClient,
  id: string,
  parentId: string | null = null,
): Promise<void> => {
  await db.$executeRawUnsafe(
    `INSERT INTO "StorageUnit" ("id", "parentId", "name", "kind", "publicId", "createdAt", "updatedAt")
     VALUES (?, ?, ?, 'BOX', ?, 0, 0)`,
    id,
    parentId,
    id,
    `PUB-${id}`,
  );
};

/**
 * Answers the connection to read the result through. A fresh one: a
 * connection opened before the migration may still be holding statements
 * prepared against the old shape of the tables.
 */
const migrateForward = async (): Promise<PrismaClient> => {
  await client?.$disconnect();
  await past!.migrateTheRest();
  client = new PrismaClient({ datasourceUrl: `file:${past!.file}` });
  return client;
};

const rolesOf = async (db: PrismaClient): Promise<Record<string, string>> => {
  const rows = await db.$queryRawUnsafe<{ id: string; role: string }[]>(
    `SELECT "id", "role" FROM "User"`,
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.role]));
};

describe("deploying accounts with roles onto an existing database", () => {
  it("makes the oldest account the administrator and everybody else a user", async () => {
    const db = await aDatabaseFromBefore();
    await anAccount(db, "partner", "2026-02-01T00:00:00.000Z");
    await anAccount(db, "dario", "2026-01-01T00:00:00.000Z");
    await anAccount(db, "lodger", "2026-03-01T00:00:00.000Z");

    const migrated = await migrateForward();

    expect(await rolesOf(migrated)).toEqual({
      dario: "administrator",
      partner: "user",
      lodger: "user",
    });
  });

  it("gives every machine token that already existed to the oldest account", async () => {
    const db = await aDatabaseFromBefore();
    await anAccount(db, "partner", "2026-02-01T00:00:00.000Z");
    await anAccount(db, "dario", "2026-01-01T00:00:00.000Z");
    await aMachineToken(db, "mcp-server");
    await aMachineToken(db, "backup");

    const migrated = await migrateForward();

    const tokens = await migrated.$queryRawUnsafe<{ name: string; userId: string }[]>(
      `SELECT "name", "userId" FROM "MachineToken" ORDER BY "name"`,
    );
    expect(tokens).toEqual([
      { name: "backup", userId: "dario" },
      { name: "mcp-server", userId: "dario" },
    ]);
  });

  it("migrates an empty database without inventing anybody", async () => {
    await aDatabaseFromBefore();

    const migrated = await migrateForward();

    expect(await rolesOf(migrated)).toEqual({});
  });

  it("refuses to migrate machine tokens that nobody could own, and says what to do", async () => {
    const db = await aDatabaseFromBefore();
    await aMachineToken(db, "mcp-server");

    await expect(migrateForward()).rejects.toThrow(/create-user/u);

    // Refused before anything was changed: the token is exactly as it was.
    const reopened = new PrismaClient({ datasourceUrl: `file:${past!.file}` });
    client = reopened;
    const columns = await reopened.$queryRawUnsafe<{ name: string }[]>(
      `SELECT "name" FROM pragma_table_info('MachineToken')`,
    );
    expect(columns.map((column) => column.name)).not.toContain("userId");
  });
});

describe("deploying owners and shares onto an existing inventory", () => {
  const aHouseholdWithAnInventory = async (): Promise<PrismaClient> => {
    const db = await aDatabaseFromBefore();
    await anAccount(db, "partner", "2026-02-01T00:00:00.000Z");
    await anAccount(db, "dario", "2026-01-01T00:00:00.000Z");
    await anAccount(db, "lodger", "2026-03-01T00:00:00.000Z");
    await aSpace(db, "garage");
    await aSpace(db, "shelf", "garage");
    await aSpace(db, "attic");
    return db;
  };

  it("makes the oldest account the owner of every root, and of nothing inside one", async () => {
    await aHouseholdWithAnInventory();

    const migrated = await migrateForward();

    const spaces = await migrated.$queryRawUnsafe<
      { id: string; ownerId: string | null }[]
    >(`SELECT "id", "ownerId" FROM "StorageUnit" ORDER BY "id"`);
    expect(spaces).toEqual([
      { id: "attic", ownerId: "dario" },
      { id: "garage", ownerId: "dario" },
      { id: "shelf", ownerId: null },
    ]);
  });

  it("gives every other account an edit share on every root, so nobody loses sight of anything", async () => {
    await aHouseholdWithAnInventory();

    const migrated = await migrateForward();

    const shares = await migrated.$queryRawUnsafe<
      { storageUnitId: string; userId: string; access: string }[]
    >(
      `SELECT "storageUnitId", "userId", "access" FROM "Share" ORDER BY "storageUnitId", "userId"`,
    );
    expect(shares).toEqual([
      { storageUnitId: "attic", userId: "lodger", access: "edit" },
      { storageUnitId: "attic", userId: "partner", access: "edit" },
      { storageUnitId: "garage", userId: "lodger", access: "edit" },
      { storageUnitId: "garage", userId: "partner", access: "edit" },
    ]);
  });

  it("refuses to migrate spaces that nobody could own, and says what to do", async () => {
    const db = await aDatabaseFromBefore();
    await aSpace(db, "garage");

    await expect(migrateForward()).rejects.toThrow(/create-user/u);

    const reopened = new PrismaClient({ datasourceUrl: `file:${past!.file}` });
    client = reopened;
    const columns = await reopened.$queryRawUnsafe<{ name: string }[]>(
      `SELECT "name" FROM pragma_table_info('StorageUnit')`,
    );
    expect(columns.map((column) => column.name)).not.toContain("ownerId");
  });
});
