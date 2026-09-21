import type { Photo, PhotoRepository, StorageUnit } from "@ariadna/domain";

import { storageUnitWithPhotoView, type StorageUnitWithPhotoView } from "./views.js";

/**
 * # Resolving the one photo a storage unit points at
 *
 * A unit holds at most one photo (ADR 9), and only the answers whose SUBJECT
 * is a unit carry it: its own screen, a patch, a move, the upload itself.
 * Every other projection of a unit is a row — a breadcrumb step, a child, a
 * node of the tree, a search hit — and a row has no photo to draw, so it gets
 * `storageUnitView` and costs no query at all.
 *
 * That is the whole reason this is a separate projector rather than something
 * `storageUnitView` grew. Threading photos through the row projection would
 * have meant loading a photo per breadcrumb step on every screen in the app
 * to feed a picture nothing draws; keeping them apart means the read happens
 * once, where it is wanted, and a unit with no photo does not read anything.
 *
 * It lives beside `views.ts` for the same reason `ItemViews` does: `views.ts`
 * is pure projection with no ports and no `await`, and a view that could
 * reach a repository is a view that can surprise its caller with a round trip.
 */
export class StorageUnitViews {
  constructor(private readonly photos: PhotoRepository) {}

  async of(unit: StorageUnit): Promise<StorageUnitWithPhotoView> {
    return storageUnitWithPhotoView(unit, await this.#photoOf(unit));
  }

  /**
   * Used where the caller already holds the photo — an upload has just
   * created it, a clear has just removed it — so the read would be a query
   * for something that is already in hand.
   */
  withPhoto(unit: StorageUnit, photo: Photo | null): StorageUnitWithPhotoView {
    return storageUnitWithPhotoView(unit, photo);
  }

  async #photoOf(unit: StorageUnit): Promise<Photo | null> {
    return unit.photoId === null ? null : await this.photos.findById(unit.photoId);
  }
}
