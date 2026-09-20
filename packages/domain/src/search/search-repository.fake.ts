import type { Item } from "../items/item.js";
import type { InMemoryItemRepository } from "../items/item-repository.fake.js";
import type { StorageUnit } from "../storage-units/storage-unit.js";
import type { InMemoryStorageUnitRepository } from "../storage-units/storage-unit-repository.fake.js";
import { matchItem, matchStorageUnit } from "./search-match.js";
import type { SearchRepository } from "./search-repository.js";

export interface InMemorySearchRepositoryDependencies {
  readonly items: InMemoryItemRepository;
  readonly storageUnits: InMemoryStorageUnitRepository;
}

/**
 * A real, working search over the in-memory repositories.
 *
 * It holds no index of its own: it reads the same Maps everything else writes
 * to, so there is nothing to keep in step and a rename is visible to the very
 * next query. That is exactly the property the Prisma adapter has to buy with
 * triggers (ADR 11), and running the same contract against both is how we find
 * out whether it managed.
 */
export class InMemorySearchRepository implements SearchRepository {
  constructor(private readonly deps: InMemorySearchRepositoryDependencies) {}

  async findItemsMatching(terms: readonly string[]): Promise<Item[]> {
    if (terms.length === 0) {
      return [];
    }

    const items = await this.deps.items.findAll();

    return items.filter((item) => matchItem(item, terms) !== null);
  }

  async findStorageUnitsMatching(
    terms: readonly string[],
  ): Promise<StorageUnit[]> {
    if (terms.length === 0) {
      return [];
    }

    const units = await this.deps.storageUnits.findAll();

    return units.filter((unit) => matchStorageUnit(unit, terms) !== null);
  }
}
