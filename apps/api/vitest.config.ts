import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Migrates once, in the main process, before any worker starts. See
    // `src/persistence/testing/migrate-template.ts` for why the schema is
    // built by the real migrator rather than by replaying SQL.
    globalSetup: ["./vitest.global-setup.ts"],
    // Workers get the template path through the environment, which is the
    // only channel global setup has to them.
    env: {},
    // Every Prisma test file owns a real SQLite file of its own, so files may
    // run in parallel, but a single file's cases share one database and must
    // not interleave.
    fileParallelism: true,
    sequence: { concurrent: false },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
