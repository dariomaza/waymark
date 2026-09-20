import { ItemNotFound } from "../items/item-errors.js";
import type { ItemRepository } from "../items/item-repository.js";
import { attachPhotoToItem, type Item } from "../items/item.js";
import type { Clock } from "../shared/clock.js";
import type { ItemId } from "../shared/identity.js";
import type { Photo } from "./photo.js";
import type { PhotoRepository } from "./photo-repository.js";

export interface AttachItemPhotoDependencies {
  readonly items: ItemRepository;
  readonly photos: PhotoRepository;
  readonly clock: Clock;
}

export interface AttachItemPhotoCommand {
  readonly itemId: ItemId;
  /**
   * An already-written photo. The bytes are on disk before this runs, because
   * the domain owns no filesystem: the adapter ingests the upload, then asks
   * the domain whether the item may have it.
   */
  readonly photo: Photo;
}

export interface AttachItemPhotoResult {
  readonly item: Item;
  readonly photo: Photo;
}

/**
 * Puts an already-stored photo on an item.
 *
 * The order inside `execute` is the whole point. The item is loaded and the
 * attachment is computed FIRST, so an unknown item or a full one throws before
 * anything is written. Saving the photo row first and discovering the cap
 * afterwards would leave a row nothing references, pointing at files no delete
 * path will ever visit.
 */
export class AttachItemPhoto {
  constructor(private readonly deps: AttachItemPhotoDependencies) {}

  async execute(command: AttachItemPhotoCommand): Promise<AttachItemPhotoResult> {
    const item = await this.deps.items.findById(command.itemId);
    if (item === null) {
      throw new ItemNotFound(command.itemId);
    }

    const updated = attachPhotoToItem(item, command.photo.id, this.deps.clock.now());

    await this.deps.photos.save(command.photo);
    await this.deps.items.save(updated);

    return { item: updated, photo: command.photo };
  }
}
