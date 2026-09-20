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

  async execute(command: ReorderItemPhotosCommand): Promise<Item> {
    const item = await this.deps.items.findById(command.itemId);
    if (item === null) {
      throw new ItemNotFound(command.itemId);
    }

    const updated = reorderItemPhotos(item, command.photoIds, this.deps.clock.now());
    await this.deps.items.save(updated);

    return updated;
  }
}
