import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Every Prisma test file owns a real SQLite file of its own, so files may
    // run in parallel, but a single file's cases share one database and must
    // not interleave.
    fileParallelism: true,
    sequence: { concurrent: false },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
