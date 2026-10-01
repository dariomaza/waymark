import { mayViewSpace, type Access } from "../access/access.js";
import { refuseViewOnly } from "../access/write-checks.js";
import type { ItemId, PhotoId } from "../shared/identity.js";
import { ItemNotFound } from "./item-errors.js";
import type { ItemRepository } from "./item-repository.js";

export interface DeleteItemDependencies {
  readonly items: ItemRepository;
}

export interface DeleteItemResult {
  /**
   * Photos that no item references any more. The domain owns no filesystem, so
   * releasing the files is the caller's job, but knowing which ones is a
   * domain answer (ADR 3).
   */
  readonly releasedPhotoIds: readonly PhotoId[];
}

/**
 * Deleting an item is unconditional, unlike deleting a storage unit (ADR 3),
 * for whoever may edit the space holding it (ADR 26).
 */
export class DeleteItem {
  constructor(private readonly deps: DeleteItemDependencies) {}

  async execute(access: Access, id: ItemId): Promise<DeleteItemResult> {
    const item = await this.deps.items.findById(id);
    if (item === null || !mayViewSpace(access, item.storageUnitId)) {
      throw new ItemNotFound(id);
    }
    refuseViewOnly(access, item.storageUnitId);

    await this.deps.items.delete(id);

    return { releasedPhotoIds: [...item.photos] };
  }
}
