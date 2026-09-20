import type { UnitId } from "@ariadna/domain";
import {
  InMemoryItemRepository,
  InMemoryPhotoRepository,
  InMemoryStorageUnitRepository,
} from "@ariadna/domain/testing";

import { domainUseCaseContract } from "./domain-use-case.contract.js";
import type {
  DomainUseCaseContext,
  ItemRepositoryContext,
  PhotoRepositoryContext,
  StorageUnitRepositoryContext,
} from "./harness.js";
import { itemRepositoryContract } from "./item-repository.contract.js";
import { photoRepositoryContract } from "./photo-repository.contract.js";
import { storageUnitRepositoryContract } from "./storage-unit-repository.contract.js";

/**
 * Run 1 of 2: the in-memory repositories the domain is tested against.
 *
 * These are the reference implementation. If a case fails here, the CONTRACT is
 * wrong, not the database.
 */

const newStorageUnits = (): InMemoryStorageUnitRepository =>
  new InMemoryStorageUnitRepository();

const forceParentLink = (repository: InMemoryStorageUnitRepository) =>
  async (id: UnitId, parentId: UnitId): Promise<void> => {
    const unit = await repository.findById(id);
    if (unit === null) {
      throw new Error(`Cannot corrupt ${id}: it was never stored`);
    }
    // Straight into the Map, past every use case and every invariant.
    await repository.save({ ...unit, parentId });
  };

storageUnitRepositoryContract({
  name: "InMemoryStorageUnitRepository",
  setUp: async (): Promise<StorageUnitRepositoryContext> => {
    const storageUnits = newStorageUnits();
    return { storageUnits, forceParentLink: forceParentLink(storageUnits) };
  },
  tearDown: async () => {},
});

itemRepositoryContract({
  name: "InMemoryItemRepository",
  setUp: async (): Promise<ItemRepositoryContext> => ({
    items: new InMemoryItemRepository(),
    storageUnits: newStorageUnits(),
  }),
  tearDown: async () => {},
});

photoRepositoryContract({
  name: "InMemoryPhotoRepository",
  setUp: async (): Promise<PhotoRepositoryContext> => ({
    photos: new InMemoryPhotoRepository(),
  }),
  tearDown: async () => {},
});

domainUseCaseContract({
  name: "in-memory repositories",
  setUp: async (): Promise<DomainUseCaseContext> => ({
    storageUnits: newStorageUnits(),
    items: new InMemoryItemRepository(),
  }),
  tearDown: async () => {},
});
