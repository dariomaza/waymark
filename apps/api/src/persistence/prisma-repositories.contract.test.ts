import type { UnitId } from "@waymark/domain";
import {
  domainUseCaseContract,
  itemRepositoryContract,
  photoRepositoryContract,
  searchRepositoryContract,
  storageUnitRepositoryContract,
  type DomainUseCaseContext,
  type ItemRepositoryContext,
  type PhotoRepositoryContext,
  type SearchRepositoryContext,
  type StorageUnitRepositoryContext,
} from "@waymark/domain-contract-tests";
import { afterAll, beforeAll } from "vitest";

import { PrismaItemRepository } from "./prisma-item-repository.js";
import { PrismaPhotoRepository } from "./prisma-photo-repository.js";
import { PrismaSearchRepository } from "./prisma-search-repository.js";
import { PrismaStorageUnitRepository } from "./prisma-storage-unit-repository.js";
import { createTestDatabase, type TestDatabase } from "./testing/test-database.js";

/**
 * Run 2 of 2: the exact same contract suites, against a real SQLite file.
 *
 * Nothing is mocked. The database is created and migrated for this test file
 * and destroyed afterwards; each case starts from empty tables. If a case
 * passes here and in `in-memory.contract.test.ts`, the two implementations are
 * interchangeable, which is the only thing that makes the ports worth having.
 */

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.destroy();
});

storageUnitRepositoryContract({
  name: "PrismaStorageUnitRepository",
  setUp: async (): Promise<StorageUnitRepositoryContext> => {
    await database.reset();
    return {
      storageUnits: new PrismaStorageUnitRepository(database.client),
      // Straight past Prisma's model layer and past every use case: a cycle is
      // perfectly legal to a foreign key, which is exactly why ADR 2 exists.
      forceParentLink: async (id: UnitId, parentId: UnitId): Promise<void> => {
        await database.client
          .$executeRaw`UPDATE "StorageUnit" SET "parentId" = ${parentId} WHERE "id" = ${id}`;
      },
    };
  },
  tearDown: async () => {},
});

itemRepositoryContract({
  name: "PrismaItemRepository",
  setUp: async (): Promise<ItemRepositoryContext> => {
    await database.reset();
    return {
      items: new PrismaItemRepository(database.client),
      storageUnits: new PrismaStorageUnitRepository(database.client),
    };
  },
  tearDown: async () => {},
});

photoRepositoryContract({
  name: "PrismaPhotoRepository",
  setUp: async (): Promise<PhotoRepositoryContext> => {
    await database.reset();
    return { photos: new PrismaPhotoRepository(database.client) };
  },
  tearDown: async () => {},
});

searchRepositoryContract({
  name: "PrismaSearchRepository",
  setUp: async (): Promise<SearchRepositoryContext> => {
    await database.reset();
    return {
      search: new PrismaSearchRepository(database.client),
      items: new PrismaItemRepository(database.client),
      storageUnits: new PrismaStorageUnitRepository(database.client),
    };
  },
  tearDown: async () => {},
});

domainUseCaseContract({
  name: "Prisma repositories on real SQLite",
  setUp: async (): Promise<DomainUseCaseContext> => {
    await database.reset();
    return {
      storageUnits: new PrismaStorageUnitRepository(database.client),
      items: new PrismaItemRepository(database.client),
    };
  },
  tearDown: async () => {},
});
