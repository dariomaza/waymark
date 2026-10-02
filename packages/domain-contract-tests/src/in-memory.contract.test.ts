import type { UnitId } from "@waymark/domain";
import {
  InMemoryItemRepository,
  InMemoryPhotoRepository,
  InMemorySearchRepository,
  InMemoryShareRepository,
  InMemoryStorageUnitRepository,
} from "@waymark/domain/testing";

import { domainUseCaseContract } from "./domain-use-case.contract.js";
import { invisibilityContract } from "./invisibility.contract.js";
import { whatEachPersonMayChangeContract } from "./what-each-person-may-change.contract.js";
import { aNarrowedTokenContract } from "./a-narrowed-token.contract.js";
import type {
  DomainUseCaseContext,
  InvisibilityContext,
  ItemRepositoryContext,
  PhotoRepositoryContext,
  SearchRepositoryContext,
  ShareRepositoryContext,
  StorageUnitRepositoryContext,
} from "./harness.js";
import { itemRepositoryContract } from "./item-repository.contract.js";
import { photoRepositoryContract } from "./photo-repository.contract.js";
import { searchRepositoryContract } from "./search-repository.contract.js";
import { shareRepositoryContract } from "./share-repository.contract.js";
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
    // Straight into the Map, past every use case and every invariant. The
    // owner goes too, as it would in the database: only a root records one.
    await repository.save({ ...unit, parentId, ownerId: null });
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

searchRepositoryContract({
  name: "InMemorySearchRepository",
  setUp: async (): Promise<SearchRepositoryContext> => {
    const storageUnits = newStorageUnits();
    const items = new InMemoryItemRepository();
    return {
      search: new InMemorySearchRepository({ items, storageUnits }),
      items,
      storageUnits,
    };
  },
  tearDown: async () => {},
});

shareRepositoryContract({
  name: "InMemoryShareRepository",
  setUp: async (): Promise<ShareRepositoryContext> => ({
    shares: new InMemoryShareRepository(),
    storageUnits: newStorageUnits(),
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

invisibilityContract({
  name: "in-memory repositories",
  setUp: async (): Promise<InvisibilityContext> => {
    const storageUnits = newStorageUnits();
    const items = new InMemoryItemRepository();
    return {
      storageUnits,
      items,
      photos: new InMemoryPhotoRepository(),
      search: new InMemorySearchRepository({ items, storageUnits }),
      shares: new InMemoryShareRepository(),
    };
  },
  tearDown: async () => {},
});

whatEachPersonMayChangeContract({
  name: "in-memory repositories",
  setUp: async (): Promise<InvisibilityContext> => {
    const storageUnits = newStorageUnits();
    const items = new InMemoryItemRepository();
    return {
      storageUnits,
      items,
      photos: new InMemoryPhotoRepository(),
      search: new InMemorySearchRepository({ items, storageUnits }),
      shares: new InMemoryShareRepository(),
    };
  },
  tearDown: async () => {},
});

aNarrowedTokenContract({
  name: "in-memory repositories",
  setUp: async (): Promise<InvisibilityContext> => {
    const storageUnits = newStorageUnits();
    const items = new InMemoryItemRepository();
    return {
      storageUnits,
      items,
      photos: new InMemoryPhotoRepository(),
      search: new InMemorySearchRepository({ items, storageUnits }),
      shares: new InMemoryShareRepository(),
    };
  },
  tearDown: async () => {},
});
