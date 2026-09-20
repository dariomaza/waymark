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

/** Deleting an item is unconditional, unlike deleting a storage unit (ADR 3). */
export class DeleteItem {
  constructor(private readonly deps: DeleteItemDependencies) {}

  async execute(id: ItemId): Promise<DeleteItemResult> {
    const item = await this.deps.items.findById(id);
    if (item === null) {
      throw new ItemNotFound(id);
    }

    await this.deps.items.delete(id);

    return { releasedPhotoIds: [...item.photos] };
  }
}
