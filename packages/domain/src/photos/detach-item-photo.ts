import { mayViewSpace, type Access } from "../access/access.js";
import { refuseViewOnly } from "../access/write-checks.js";
import { ItemNotFound } from "../items/item-errors.js";
import type { ItemRepository } from "../items/item-repository.js";
import { detachPhotoFromItem, type Item } from "../items/item.js";
import type { Clock } from "../shared/clock.js";
import type { ItemId, PhotoId } from "../shared/identity.js";

export interface DetachItemPhotoDependencies {
  readonly items: ItemRepository;
  readonly clock: Clock;
}

export interface DetachItemPhotoCommand {
  readonly itemId: ItemId;
  readonly photoId: PhotoId;
}

export interface DetachItemPhotoResult {
  readonly item: Item;
  /** Same contract as `DeleteItem`: the caller owns the files (ADR 3). */
  readonly releasedPhotoIds: readonly PhotoId[];
}

/**
 * Takes a photo off an item and reports it as released.
 *
 * The photo ROW is deliberately left alone. The files are still on disk, and
 * only the caller can remove them; forgetting the row here would throw away the
 * paths that make those files findable at all. Releasing is one step, and it
 * belongs to whoever owns the filesystem.
 */
export class DetachItemPhoto {
  constructor(private readonly deps: DetachItemPhotoDependencies) {}

  async execute(access: Access, command: DetachItemPhotoCommand): Promise<DetachItemPhotoResult> {
    const item = await this.deps.items.findById(command.itemId);
    if (item === null || !mayViewSpace(access, item.storageUnitId)) {
      throw new ItemNotFound(command.itemId);
    }
    // Before the photo is looked for, so a view-only person learns nothing
    // about which photos the item holds that they could not already see.
    refuseViewOnly(access, item.storageUnitId);

    const updated = detachPhotoFromItem(item, command.photoId, this.deps.clock.now());
    await this.deps.items.save(updated);

    return { item: updated, releasedPhotoIds: [command.photoId] };
  }
}
