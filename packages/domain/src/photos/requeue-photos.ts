import { mayEditSpace, mayViewSpace, ShareLevel, type Access } from "../access/access.js";
import { SpaceIsViewOnly } from "../access/access-errors.js";
import type { ItemRepository } from "../items/item-repository.js";
import type { PhotoId, UnitId } from "../shared/identity.js";
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
 * the person may change (ADR 26): the ones shown by something in a space they
 * may edit. Any other photo is left exactly as it was and is absent from the
 * answer, as a photo that does not exist would be.
 *
 * Answers the photos it requeued. Forgetting their attempts and waking the
 * worker belong to the processing queue, which lives outside the domain.
 */
export class RequeuePhotos {
  readonly #reach: ReachablePhotos;

  constructor(private readonly deps: RequeuePhotosDependencies) {
    this.#reach = new ReachablePhotos(deps);
  }

  /**
   * In bulk: whatever among `ids` the person may change. Photos they may only
   * view are skipped rather than refused, because "try everything that
   * failed" means everything they may try.
   */
  async execute(access: Access, ids: readonly PhotoId[]): Promise<Photo[]> {
    const reach = await this.#reach.execute(access, ShareLevel.EDIT);
    const found = await this.deps.photos.findManyByIds(
      ids.filter((id) => reachesPhoto(reach, id)),
    );

    const requeued = found.map(markPhotoPending);
    for (const photo of requeued) {
      await this.deps.photos.save(photo);
    }

    return requeued;
  }

  /**
   * One photo, asked for by name. `null` both when there is no such photo and
   * when the person may not see it, as `FindPhoto` answers; `SpaceIsViewOnly`
   * when they may see it but not change anything that shows it.
   */
  async one(access: Access, id: PhotoId): Promise<Photo | null> {
    const photo = await this.deps.photos.findById(id);
    if (photo === null) {
      return null;
    }

    if (access.kind === "scoped") {
      const [items, units] = await Promise.all([
        this.deps.items.findByPhoto(id),
        this.deps.storageUnits.findByPhoto(id),
      ]);
      const showing: UnitId[] = [
        ...items.map((item) => item.storageUnitId),
        ...units.map((unit) => unit.id),
      ];
      if (!showing.some((space) => mayEditSpace(access, space))) {
        const seenIn = showing.find((space) => mayViewSpace(access, space));
        if (seenIn === undefined) {
          return null;
        }
        throw new SpaceIsViewOnly(seenIn);
      }
    }

    const requeued = markPhotoPending(photo);
    await this.deps.photos.save(requeued);

    return requeued;
  }
}
