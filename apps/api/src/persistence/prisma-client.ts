import { PrismaClient } from "@prisma/client";

/**
 * The single Prisma client the API composes its repositories from.
 *
 * Nothing outside `src/persistence` should ever hold one: the rest of the
 * application talks to `StorageUnitRepository` and `ItemRepository`, which is
 * what makes "swap SQLite for Postgres later" an adapter change rather than a
 * rewrite (see the README).
 */
export const createPrismaClient = (databaseUrl?: string): PrismaClient =>
  databaseUrl === undefined
    ? new PrismaClient()
    : new PrismaClient({ datasourceUrl: databaseUrl });

export type { PrismaClient };
