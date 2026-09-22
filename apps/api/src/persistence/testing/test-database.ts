import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../../prisma/migrations", import.meta.url),
);

/**
 * The checked-in migrations, applied statement by statement.
 *
 * This runs the SAME SQL that `prisma migrate deploy` would, so the tests
 * exercise the real schema rather than a `db push` approximation of it, without
 * paying to spawn the Prisma CLI once per test file.
 */
const loadMigrationStatements = async (): Promise<string[]> => {
  const entries = await readdir(MIGRATIONS_DIRECTORY, { withFileTypes: true });
  const migrations = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const statements: string[] = [];
  for (const migration of migrations) {
    const sql = await readFile(
      join(MIGRATIONS_DIRECTORY, migration, "migration.sql"),
      "utf8",
    );
    statements.push(...splitStatements(sql));
  }

  return statements;
};

/**
 * Splits a migration into statements the way SQLite's own `execute_batch`
 * does, which is what `prisma migrate deploy` ends up calling.
 *
 * Splitting on `;` alone is not enough: a `CREATE TRIGGER` carries its body
 * between `BEGIN` and `END`, semicolons and all, so a naive split hands the
 * database half a trigger and the other half as a statement of its own. The
 * fragments are therefore rejoined until the trigger is closed.
 */
const isUnclosedTrigger = (statement: string): boolean =>
  /^CREATE\s+TRIGGER\b/iu.test(statement) && !/\bEND$/iu.test(statement);

const splitStatements = (sql: string): string[] => {
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  const statements: string[] = [];
  let pending = "";

  for (const fragment of withoutComments.split(";")) {
    pending = pending.length === 0 ? fragment : `${pending};${fragment}`;

    const statement = pending.trim();
    if (statement.length === 0) {
      pending = "";
      continue;
    }

    if (isUnclosedTrigger(statement)) {
      continue;
    }

    statements.push(statement);
    pending = "";
  }

  return statements;
};

export const createTestDatabase = async (): Promise<TestDatabase> => {
  const directory = await mkdtemp(join(tmpdir(), "waymark-sqlite-"));
  const file = join(directory, `${randomUUID()}.db`);
  const client = new PrismaClient({ datasourceUrl: `file:${file}` });

  for (const statement of await loadMigrationStatements()) {
    await client.$executeRawUnsafe(statement);
  }

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
    },

    async destroy(): Promise<void> {
      await client.$disconnect();
      await rm(directory, { recursive: true, force: true });
    },
  };
};
