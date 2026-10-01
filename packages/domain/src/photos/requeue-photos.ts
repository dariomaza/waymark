import type { Access } from "../access/access.js";
import type { ItemRepository } from "../items/item-repository.js";
import type { PhotoId } from "../shared/identity.js";
import type { StorageUnitRepository } from "../storage-units/storage-unit-repository.js";
import { markPhotoPending, type Photo } from "./photo.js";
import type { PhotoRepository } from "./photo-repository.js";
import { ReachablePhotos, reachesPhoto } from "./reachable-photos.js";

export interface RequeuePhotosDependencies {
  readonly photos: PhotoRepository;
  readonly items: ItemRepository;
  readonly storageUnits: StorageUnitRepository;
}

/**
 * "Try these again" for background removal (ADR 4), limited to the photos
 * the person may see (ADR 26). A photo out of reach is left exactly as it was
 * and is absent from the answer, as a photo that does not exist would be.
 *
 * Answers the photos it requeued. Forgetting their attempts and waking the
 * worker belong to the processing queue, which lives outside the domain.
 */
export class RequeuePhotos {
  readonly #reach: ReachablePhotos;

  constructor(private readonly deps: RequeuePhotosDependencies) {
    this.#reach = new ReachablePhotos(deps);
  }

  async execute(access: Access, ids: readonly PhotoId[]): Promise<Photo[]> {
    const reach = await this.#reach.execute(access);
    const found = await this.deps.photos.findManyByIds(
      ids.filter((id) => reachesPhoto(reach, id)),
    );

    const requeued = found.map(markPhotoPending);
    for (const photo of requeued) {
      await this.deps.photos.save(photo);
    }

    return requeued;
  }
}
