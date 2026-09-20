import type { Clock } from "../shared/clock.js";
import type { PhotoId, UnitId } from "../shared/identity.js";
import { StorageUnitNotFound } from "../storage-units/storage-unit-errors.js";
import type { StorageUnitRepository } from "../storage-units/storage-unit-repository.js";
import { setStorageUnitPhoto, type StorageUnit } from "../storage-units/storage-unit.js";
import type { Photo } from "./photo.js";
import type { PhotoRepository } from "./photo-repository.js";

export interface SetStorageUnitPhotoDependencies {
  readonly storageUnits: StorageUnitRepository;
  readonly photos: PhotoRepository;
  readonly clock: Clock;
}

export interface SetStorageUnitPhotoCommand {
  readonly unitId: UnitId;
  /** An already-written photo, or `null` to leave the unit without one. */
  readonly photo: Photo | null;
}

export interface SetStorageUnitPhotoResult {
  readonly unit: StorageUnit;
  /** The photo that was there before, if any. The caller owns its files. */
  readonly releasedPhotoIds: readonly PhotoId[];
}

/**
 * A storage unit holds ONE photo, so this is a replacement rather than an
 * append, and a replacement always releases what it displaced.
 *
 * This is a named operation and not a `PATCH` for the same reason move and
 * empty are (see the README): a unit has no general update, and a photo change
 * is the only field change there is.
 */
export class SetStorageUnitPhoto {
  constructor(private readonly deps: SetStorageUnitPhotoDependencies) {}

  async execute(
    command: SetStorageUnitPhotoCommand,
  ): Promise<SetStorageUnitPhotoResult> {
    const unit = await this.deps.storageUnits.findById(command.unitId);
    if (unit === null) {
      throw new StorageUnitNotFound(command.unitId);
    }

    const previousPhotoId = unit.photoId;
    const updated = setStorageUnitPhoto(
      unit,
      command.photo?.id ?? null,
      this.deps.clock.now(),
    );

    if (command.photo !== null) {
      await this.deps.photos.save(command.photo);
    }
    await this.deps.storageUnits.save(updated);

    return {
      unit: updated,
      releasedPhotoIds:
        previousPhotoId === null || previousPhotoId === command.photo?.id
          ? []
          : [previousPhotoId],
    };
  }
}
