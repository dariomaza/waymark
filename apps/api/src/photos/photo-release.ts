import type { PhotoId, PhotoRepository } from "@ariadna/domain";

import type { PhotoFileStore } from "./photo-file-store.js";

/**
 * # Releasing photos: the database wins, always
 *
 * Deleting an item hands back `releasedPhotoIds` (ADR 3). Turning that into
 * "the files are gone" means touching two stores that cannot be committed
 * together, so one of them has to be allowed to fail on its own. This picks
 * the database.
 *
 * **The order is: read the paths, delete the rows, then unlink the files.**
 * A failure to unlink is logged and nothing else. It never rolls back, never
 * fails the request, and never retries in-band.
 *
 * ## Why the database, and not the filesystem
 *
 * The alternative — unlink first, and abort the delete if a file will not go —
 * is worse in every case that actually happens:
 *
 * - The disk is full, the volume is mounted read-only after a bad reboot, or
 *   the container lost its mount. Every one of those makes `unlink` fail
 *   indefinitely, and letting the filesystem win means the user cannot delete
 *   anything until somebody with a shell fixes the box. Deleting an item is
 *   supposed to be the safe operation.
 * - It is not even atomic in the direction it claims. Unlink the original,
 *   fail on the thumbnail, roll the transaction back, and the item is still
 *   there in the database pointing at a photo whose file is gone: a broken
 *   image in the UI and no way to fix it through the product.
 * - The two failure modes are not comparable. Losing the delete is a user
 *   visible lie ("I deleted that box last week and it is still here"). Losing
 *   the unlink is some bytes on a disk.
 *
 * ## The orphan is real, and it is named
 *
 * A file that outlives its row is unreachable: nothing points at it, no route
 * can serve it, and it occupies space until somebody sweeps it. That is the
 * price, it is paid knowingly, and the log line carries the exact path so a
 * sweep is `rm` and not an investigation. A reconciliation job that walks the
 * photo root against the `Photo` table is a natural later addition; it is not
 * needed for correctness, only for disk.
 *
 * The reverse orphan — a row with no file — is NOT tolerated here, which is why
 * the rows go first: a row is what makes a file findable, so a row pointing at
 * nothing is worse than a file nothing points at.
 */

export interface PhotoReleaseDependencies {
  readonly photos: PhotoRepository;
  readonly files: PhotoFileStore;
}

export interface ReleaseOutcome {
  readonly releasedPhotoIds: readonly PhotoId[];
  /** Files that could not be unlinked. Logged, never thrown. */
  readonly orphanedPaths: readonly string[];
}

export class PhotoRelease {
  constructor(private readonly deps: PhotoReleaseDependencies) {}

  async release(ids: readonly PhotoId[]): Promise<ReleaseOutcome> {
    if (ids.length === 0) {
      return { releasedPhotoIds: [], orphanedPaths: [] };
    }

    // Read the paths BEFORE the rows go. They are the only record of where the
    // files are; deleting first would leave nothing to unlink with.
    const photos = await this.deps.photos.findManyByIds(ids);
    const paths = photos.flatMap((photo) => [
      photo.originalPath,
      photo.thumbnailPath,
      ...(photo.processedPath === null ? [] : [photo.processedPath]),
    ]);

    await this.deps.photos.deleteMany(ids);

    const { failed } = await this.deps.files.remove(paths);

    return { releasedPhotoIds: ids, orphanedPaths: failed };
  }
}
