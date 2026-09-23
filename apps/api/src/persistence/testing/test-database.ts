import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TEMPLATE_ENV } from "./migrate-template.js";
import { PrismaClient } from "@prisma/client";

/**
 * A real SQLite database in a temporary file, created and migrated per test
 * file and thrown away afterwards.
 *
 * Nothing about Prisma is mocked. A mocked client proves that the adapter calls
 * the methods the test expects; it proves nothing about foreign keys, recursive
 * CTEs, `ON DELETE RESTRICT`, unique indexes or millisecond timestamps, which
 * is where every interesting persistence bug actually lives.
 */
export interface TestDatabase {
  readonly client: PrismaClient;
  /** Empties every table, so each case starts from nothing. */
  reset(): Promise<void>;
  /** Disconnects and removes the temporary file. */
  destroy(): Promise<void>;
}

export const createTestDatabase = async (): Promise<TestDatabase> => {
  const template = process.env[TEMPLATE_ENV];
  if (template === undefined || template === "") {
    throw new Error(
      `${TEMPLATE_ENV} is unset: the migrated template is built by vitest's global setup, so this only happens outside a test run.`,
    );
  }

  const directory = await mkdtemp(join(tmpdir(), "waymark-sqlite-"));
  const file = join(directory, `${randomUUID()}.db`);
  // A copy of a migrated database, not a replay of migrations. Same schema as
  // the deployment gets, and no SQL parsed by hand on the way.
  await copyFile(template, file);

  const client = new PrismaClient({ datasourceUrl: `file:${file}` });

  return {
    client,

    async reset(): Promise<void> {
      // Detaching every unit first breaks the self-referencing foreign key —
      // AND any cycle a test deliberately wrote — so the deletes below never
      // depend on hierarchy order and never get stuck on corrupt data.
      await client.$executeRawUnsafe(`UPDATE "StorageUnit" SET "parentId" = NULL`);
      await client.$executeRawUnsafe(`DELETE FROM "ItemPhoto"`);
      await client.$executeRawUnsafe(`DELETE FROM "ItemTag"`);
      await client.$executeRawUnsafe(`DELETE FROM "Item"`);
      await client.$executeRawUnsafe(`DELETE FROM "PhotoProcessingAttempt"`);
      await client.$executeRawUnsafe(`DELETE FROM "Photo"`);
      await client.$executeRawUnsafe(`DELETE FROM "StorageUnit"`);
      await client.$executeRawUnsafe(`DELETE FROM "Session"`);
      await client.$executeRawUnsafe(`DELETE FROM "User"`);
      // No foreign key to anything, so the order here does not matter — but it
      // has to be emptied, or a contract case would inherit the previous one's
      // unique names and fail for a reason that has nothing to do with it.
      await client.$executeRawUnsafe(`DELETE FROM "MachineToken"`);
    },

    async destroy(): Promise<void> {
      await client.$disconnect();
      await rm(directory, { recursive: true, force: true });
    },
  };
};
