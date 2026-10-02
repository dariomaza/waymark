import { mayViewSpace, type Access } from "../access/access.js";
import type { ItemRepository } from "../items/item-repository.js";
import type { PhotoId } from "../shared/identity.js";
import type { StorageUnitRepository } from "../storage-units/storage-unit-repository.js";
import type { Photo } from "./photo.js";
import type { PhotoRepository } from "./photo-repository.js";

export interface FindPhotoDependencies {
  readonly photos: PhotoRepository;
  readonly items: ItemRepository;
  readonly storageUnits: StorageUnitRepository;
}

/**
 * One photo, for a person who may see it (ADR 26).
 *
 * A photo is seen through what shows it: an item in a space the person may
 * see, or the picture of such a space. `null` both when there is no such
 * photo and when the person may not see it, so whoever serves the bytes
 * answers the two the same way. Refusing is the caller's, because "this photo
 * is not here" is said by the transport, not by the domain.
 */
export class FindPhoto {
  constructor(private readonly deps: FindPhotoDependencies) {}

  async execute(access: Access, id: PhotoId): Promise<Photo | null> {
    const photo = await this.deps.photos.findById(id);
    if (photo === null || access.kind === "everything") {
      return photo;
    }

    const [items, units] = await Promise.all([
      this.deps.items.findByPhoto(id),
      this.deps.storageUnits.findByPhoto(id),
    ]);
    const seen =
      items.some((item) => mayViewSpace(access, item.storageUnitId)) ||
      units.some((unit) => mayViewSpace(access, unit.id));

    return seen ? photo : null;
  }
}
