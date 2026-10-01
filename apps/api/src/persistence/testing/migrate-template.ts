import { execFile } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * # One schema, built the way production builds it
 *
 * The test database used to be assembled by reading every `migration.sql`,
 * splitting it on semicolons and replaying the pieces. That is a SECOND way
 * of getting to the schema, beside the `prisma migrate deploy` the container
 * entrypoint runs — and a second way is a second thing that can be wrong.
 *
 * It was. Statement 27 of 44, `ALTER TABLE "new_Photo" RENAME TO "Photo"`,
 * failed on Linux with `index Photo_processingStatus_idx already exists` and
 * passed on macOS, because renaming a table carries its indexes and the two
 * platforms ship different SQLite builds inside Prisma's query engine. The
 * SQL was never wrong. The replay was.
 *
 * So the schema is now built ONCE per test run by the real migrator, and
 * every test database is a copy of that file. One CLI invocation instead of
 * thirteen, no hand-written SQL parser, and — the point — the schema under
 * test is the schema the deployment gets.
 */
export const TEMPLATE_ENV = "WAYMARK_TEST_TEMPLATE_DB";

export interface Template {
  readonly file: string;
  readonly dispose: () => Promise<void>;
}

export const buildTemplateDatabase = async (): Promise<Template> => {
  const directory = await mkdtemp(join(tmpdir(), "waymark-template-"));
  const file = join(directory, "template.db");

  await run("node_modules/.bin/prisma", ["migrate", "deploy"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      // Not the developer's `.env`: a test run must never touch a database
      // somebody is also looking at.
      DATABASE_URL: `file:${file}`,
    },
  });

  return {
    file,
    dispose: async () => {
      await rm(directory, { recursive: true, force: true });
    },
  };
};

/**
 * A database stopped in the past, for proving what a migration does to data
 * that already exists.
 *
 * Still the real migrator and nothing else: the checked-in migrations are
 * copied, up to and including `lastApplied`, into a directory of their own
 * beside a copy of the schema, and `prisma migrate deploy` is pointed at it.
 * `migrateTheRest` then copies in every later migration and deploys again —
 * exactly what the container entrypoint does on the day a release lands on a
 * database written by the one before it.
 */
export interface DatabaseInThePast {
  readonly file: string;
  /** Applies every migration after `lastApplied`. Rejects with Prisma's output when one fails. */
  migrateTheRest(): Promise<void>;
  dispose(): Promise<void>;
}

const MIGRATIONS = join(process.cwd(), "prisma", "migrations");

export const buildDatabaseMigratedThrough = async (
  lastApplied: string,
): Promise<DatabaseInThePast> => {
  const directory = await mkdtemp(join(tmpdir(), "waymark-past-"));
  const file = join(directory, "past.db");
  const schema = join(directory, "schema.prisma");
  await mkdir(join(directory, "migrations"));
  await copyFile(join(process.cwd(), "prisma", "schema.prisma"), schema);
  await copyFile(
    join(MIGRATIONS, "migration_lock.toml"),
    join(directory, "migrations", "migration_lock.toml"),
  );

  const migrations = (await readdir(MIGRATIONS, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (!migrations.includes(lastApplied)) {
    throw new Error(`There is no migration called ${lastApplied}`);
  }

  const copy = async (names: readonly string[]): Promise<void> => {
    for (const name of names) {
      await cp(join(MIGRATIONS, name), join(directory, "migrations", name), {
        recursive: true,
      });
    }
  };

  const deploy = async (): Promise<void> => {
    await run("node_modules/.bin/prisma", ["migrate", "deploy", "--schema", schema], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${file}` },
    });
  };

  await copy(migrations.filter((name) => name <= lastApplied));
  await deploy();

  return {
    file,
    async migrateTheRest(): Promise<void> {
      await copy(migrations.filter((name) => name > lastApplied));
      await deploy();
    },
    async dispose(): Promise<void> {
      await rm(directory, { recursive: true, force: true });
    },
  };
};
