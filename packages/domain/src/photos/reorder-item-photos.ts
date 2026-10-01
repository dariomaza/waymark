import { mayViewSpace, type Access } from "../access/access.js";
import { refuseViewOnly } from "../access/write-checks.js";
import { ItemNotFound } from "../items/item-errors.js";
import type { ItemRepository } from "../items/item-repository.js";
import { reorderItemPhotos, type Item } from "../items/item.js";
import type { Clock } from "../shared/clock.js";
import type { ItemId, PhotoId } from "../shared/identity.js";

export interface ReorderItemPhotosDependencies {
  readonly items: ItemRepository;
  readonly clock: Clock;
}

export interface ReorderItemPhotosCommand {
  readonly itemId: ItemId;
  /** The complete list, in the wanted order. The first one becomes the cover. */
  readonly photoIds: readonly PhotoId[];
}

/**
 * Chooses the cover, spelled as what it actually is: an ordering.
 *
 * There is no `setCoverPhoto` because the cover is not a field. It is
 * `photos[0]`, in the domain and in `ItemPhoto.position` alike, and inventing a
 * second way to say the same thing is how the two get to disagree.
 */
export class ReorderItemPhotos {
  constructor(private readonly deps: ReorderItemPhotosDependencies) {}

  async execute(access: Access, command: ReorderItemPhotosCommand): Promise<Item> {
    const item = await this.deps.items.findById(command.itemId);
    if (item === null || !mayViewSpace(access, item.storageUnitId)) {
      throw new ItemNotFound(command.itemId);
    }
    // Before the photo is looked for, so a view-only person learns nothing
    // about which photos the item holds that they could not already see.
    refuseViewOnly(access, item.storageUnitId);

    const updated = reorderItemPhotos(item, command.photoIds, this.deps.clock.now());
    await this.deps.items.save(updated);

    return updated;
  }
}
