import {
  mayEditSpace,
  mayViewSpace,
  ShareLevel,
  type Access,
} from "../access/access.js";
import type { UnitId } from "../shared/identity.js";
import type { ItemRepository } from "../items/item-repository.js";
import type { PhotoId } from "../shared/identity.js";
import type { StorageUnitRepository } from "../storage-units/storage-unit-repository.js";

/**
 * The photos a query may look at on a person's behalf (ADR 26): the ones
 * shown by an item or a space they may see, or every photo for somebody who
 * may see everything.
 */
export type PhotoReach =
  | { readonly kind: "everywhere" }
  | { readonly kind: "within"; readonly photoIds: readonly PhotoId[] };

export interface ReachablePhotosDependencies {
  readonly items: ItemRepository;
  readonly storageUnits: StorageUnitRepository;
}

/**
 * Every photo a person may see, for the reads that cover photos in bulk and
 * cut them to a limit: the background-removal queue (ADR 4).
 *
 * A photo belongs to nobody on its own (ADR 4 makes it its own aggregate). It
 * is seen through what shows it, so a photo that shows nothing any more is
 * reachable only by somebody who may see everything.
 *
 * At `edit`, the photos the person may change instead: the ones shown by
 * something in a space they may edit. That is what trying a photo's
 * background removal again needs (ADR 26).
 */
export class ReachablePhotos {
  constructor(private readonly deps: ReachablePhotosDependencies) {}

  async execute(
    access: Access,
    level: ShareLevel = ShareLevel.VIEW,
  ): Promise<PhotoReach> {
    if (access.kind === "everything") {
      return { kind: "everywhere" };
    }

    const [items, units] = await Promise.all([
      this.deps.items.findAll(),
      this.deps.storageUnits.findAll(),
    ]);

    const may = (id: UnitId): boolean =>
      level === ShareLevel.EDIT ? mayEditSpace(access, id) : mayViewSpace(access, id);
    const photoIds = new Set<PhotoId>();
    for (const item of items) {
      if (may(item.storageUnitId)) {
        for (const id of item.photos) {
          photoIds.add(id);
        }
      }
    }
    for (const unit of units) {
      if (unit.photoId !== null && may(unit.id)) {
        photoIds.add(unit.photoId);
      }
    }

    return { kind: "within", photoIds: [...photoIds] };
  }
}

/** Whether a reach takes in a photo. */
export const reachesPhoto = (reach: PhotoReach, id: PhotoId): boolean =>
  reach.kind === "everywhere" || reach.photoIds.includes(id);
