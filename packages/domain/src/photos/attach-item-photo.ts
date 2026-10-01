import { mayViewSpace, type Access } from "../access/access.js";
import { refuseViewOnly } from "../access/write-checks.js";
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
 *
 * It needs edit on the space holding the item (ADR 26).
 */
export class AttachItemPhoto {
  constructor(private readonly deps: AttachItemPhotoDependencies) {}

  /**
   * The item, if this person may add a photo to it; otherwise the refusal
   * `execute` would make. For whoever stores the upload, so a refused one
   * costs no decode and no file written.
   */
  async authorize(access: Access, itemId: ItemId): Promise<Item> {
    const item = await this.deps.items.findById(itemId);
    if (item === null || !mayViewSpace(access, item.storageUnitId)) {
      throw new ItemNotFound(itemId);
    }
    refuseViewOnly(access, item.storageUnitId);

    return item;
  }

  async execute(
    access: Access,
    command: AttachItemPhotoCommand,
  ): Promise<AttachItemPhotoResult> {
    const item = await this.authorize(access, command.itemId);

    const updated = attachPhotoToItem(item, command.photo.id, this.deps.clock.now());

    await this.deps.photos.save(command.photo);
    await this.deps.items.save(updated);

    return { item: updated, photo: command.photo };
  }
}
