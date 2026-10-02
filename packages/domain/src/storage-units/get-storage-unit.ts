import type { Access } from "../access/access.js";
import type { Item } from "../items/item.js";
import type { ItemRepository } from "../items/item-repository.js";
import type { UnitId } from "../shared/identity.js";
import { GetStorageUnitPath } from "./get-storage-unit-path.js";
import { StorageUnitNotFound } from "./storage-unit-errors.js";
import type { StorageUnit } from "./storage-unit.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

export interface GetStorageUnitDependencies {
  readonly storageUnits: StorageUnitRepository;
  readonly items: ItemRepository;
}

/** One space as its own screen shows it. Nothing here is sorted. */
export interface StorageUnitContents {
  readonly unit: StorageUnit;
  /** From the person's visible root down to the unit itself (ADR 26). */
  readonly path: readonly StorageUnit[];
  readonly children: readonly StorageUnit[];
  readonly items: readonly Item[];
}

/**
 * A space, where it is and what it holds, for a person who may see it.
 *
 * Reach runs down the tree (ADR 26), so whoever may see a space may see every
 * space and item inside it; only the space itself, and the part of the
 * breadcrumb above it, need deciding.
 */
export class GetStorageUnit {
  readonly #paths: GetStorageUnitPath;

  constructor(private readonly deps: GetStorageUnitDependencies) {
    this.#paths = new GetStorageUnitPath({ storageUnits: deps.storageUnits });
  }

  async execute(access: Access, id: UnitId): Promise<StorageUnitContents> {
    // Refuses a space out of reach exactly as it refuses a missing one.
    const path = await this.#paths.execute(access, id);
    const unit = path.at(-1);
    if (unit === undefined) {
      throw new StorageUnitNotFound(id);
    }

    const [children, items] = await Promise.all([
      this.deps.storageUnits.findChildren(id),
      this.deps.items.findByStorageUnit(id),
    ]);

    return { unit, path, children, items };
  }
}
