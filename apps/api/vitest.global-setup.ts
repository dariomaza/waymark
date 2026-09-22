import { buildTemplateDatabase, TEMPLATE_ENV } from "./src/persistence/testing/migrate-template.js";

/**
 * Migrates once, for the whole run.
 *
 * Global setup happens in the main process before any worker starts, which is
 * the only place a single `prisma migrate deploy` can serve every file. A
 * module-level singleton would not: vitest runs files in separate worker
 * processes, so "once" would quietly mean "once per worker".
 */
export const setup = async (): Promise<() => Promise<void>> => {
  const template = await buildTemplateDatabase();
  process.env[TEMPLATE_ENV] = template.file;

  return async () => {
    await template.dispose();
  };
};
