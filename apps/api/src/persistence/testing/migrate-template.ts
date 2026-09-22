import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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
