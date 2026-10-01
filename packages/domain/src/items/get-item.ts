import { mayViewSpace, type Access } from "../access/access.js";
import type { ItemId } from "../shared/identity.js";
import { GetStorageUnitPath } from "../storage-units/get-storage-unit-path.js";
import type { StorageUnitRepository } from "../storage-units/storage-unit-repository.js";
import { ItemNotFound } from "./item-errors.js";
import type { ItemAtLocation } from "./list-items.js";
import type { ItemRepository } from "./item-repository.js";

export interface GetItemDependencies {
  readonly items: ItemRepository;
  readonly storageUnits: StorageUnitRepository;
}

/**
 * One item and where it is, for a person who may see it.
 *
 * "Where is it" is the question the product exists to answer, so the path
 * comes with the item, cut at the top of what the person may see (ADR 26).
 * An item in a space out of reach is refused exactly as a missing one is.
 */
export class GetItem {
  readonly #paths: GetStorageUnitPath;

  constructor(private readonly deps: GetItemDependencies) {
    this.#paths = new GetStorageUnitPath({ storageUnits: deps.storageUnits });
  }

  async execute(access: Access, id: ItemId): Promise<ItemAtLocation> {
    const item = await this.deps.items.findById(id);
    if (item === null || !mayViewSpace(access, item.storageUnitId)) {
      throw new ItemNotFound(id);
    }

    return { item, path: await this.#paths.execute(access, item.storageUnitId) };
  }
}
