import type { UnitId } from "@waymark/domain";
import {
  CONTRACT_PEOPLE,
  domainUseCaseContract,
  itemRepositoryContract,
  photoRepositoryContract,
  searchRepositoryContract,
  shareRepositoryContract,
  storageUnitRepositoryContract,
  type DomainUseCaseContext,
  type ItemRepositoryContext,
  type PhotoRepositoryContext,
  type SearchRepositoryContext,
  type ShareRepositoryContext,
  type StorageUnitRepositoryContext,
} from "@waymark/domain-contract-tests";
import { afterAll, beforeAll } from "vitest";

import { PrismaItemRepository } from "./prisma-item-repository.js";
import { PrismaPhotoRepository } from "./prisma-photo-repository.js";
import { PrismaSearchRepository } from "./prisma-search-repository.js";
import { PrismaShareRepository } from "./prisma-share-repository.js";
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

/**
 * Empty tables, except that everybody the contracts mention has an account: a
 * root's owner is a foreign key (ADR 26), which a Map never had to satisfy.
 */
const emptyHouseOfContractPeople = async (): Promise<void> => {
  await database.reset();
  for (const id of CONTRACT_PEOPLE) {
    await database.client.user.create({
      data: {
        id,
        username: id,
        passwordHash: "not-a-real-hash",
        createdAt: new Date("2026-04-01T09:00:00.000Z"),
        updatedAt: new Date("2026-04-01T09:00:00.000Z"),
      },
    });
  }
};

afterAll(async () => {
  await database.destroy();
});

storageUnitRepositoryContract({
  name: "PrismaStorageUnitRepository",
  setUp: async (): Promise<StorageUnitRepositoryContext> => {
    await emptyHouseOfContractPeople();
    return {
      storageUnits: new PrismaStorageUnitRepository(database.client),
      // Straight past Prisma's model layer and past every use case: a cycle is
      // perfectly legal to a foreign key, which is exactly why ADR 2 exists.
      // The owner goes with it: only a root may record one (ADR 26).
      forceParentLink: async (id: UnitId, parentId: UnitId): Promise<void> => {
        await database.client
          .$executeRaw`UPDATE "StorageUnit" SET "parentId" = ${parentId}, "ownerId" = NULL WHERE "id" = ${id}`;
      },
    };
  },
  tearDown: async () => {},
});

itemRepositoryContract({
  name: "PrismaItemRepository",
  setUp: async (): Promise<ItemRepositoryContext> => {
    await emptyHouseOfContractPeople();
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
    await emptyHouseOfContractPeople();
    return { photos: new PrismaPhotoRepository(database.client) };
  },
  tearDown: async () => {},
});

searchRepositoryContract({
  name: "PrismaSearchRepository",
  setUp: async (): Promise<SearchRepositoryContext> => {
    await emptyHouseOfContractPeople();
    return {
      search: new PrismaSearchRepository(database.client),
      items: new PrismaItemRepository(database.client),
      storageUnits: new PrismaStorageUnitRepository(database.client),
    };
  },
  tearDown: async () => {},
});

shareRepositoryContract({
  name: "PrismaShareRepository",
  setUp: async (): Promise<ShareRepositoryContext> => {
    await emptyHouseOfContractPeople();
    return {
      shares: new PrismaShareRepository(database.client),
      storageUnits: new PrismaStorageUnitRepository(database.client),
    };
  },
  tearDown: async () => {},
});

domainUseCaseContract({
  name: "Prisma repositories on real SQLite",
  setUp: async (): Promise<DomainUseCaseContext> => {
    await emptyHouseOfContractPeople();
    return {
      storageUnits: new PrismaStorageUnitRepository(database.client),
      items: new PrismaItemRepository(database.client),
    };
  },
  tearDown: async () => {},
});
