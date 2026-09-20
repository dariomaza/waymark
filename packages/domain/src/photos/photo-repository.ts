import type { PhotoId } from "../shared/identity.js";
import type { Photo } from "./photo.js";

/**
 * A photo is its own aggregate with its own lifecycle (ADR 4), so it gets its
 * own port rather than hanging off the item or the storage unit that references
 * it. An item may be deleted while its photos are still being processed, and a
 * photo may outlive the item for as long as it takes the caller to release the
 * files.
 *
 * The port speaks about ROWS, never about bytes. Where the file lives, how it
 * is written and how it is served are adapter concerns; the domain only knows
 * that a photo has paths and a processing state.
 */
export interface PhotoRepository {
  findById(id: PhotoId): Promise<Photo | null>;

  /** Only the photos that exist; missing ids are simply absent. */
  findManyByIds(ids: readonly PhotoId[]): Promise<Photo[]>;

  save(photo: Photo): Promise<void>;

  /**
   * Forgets the rows. It deliberately says nothing about the files: releasing
   * those is the caller's job, because the domain owns no filesystem.
   */
  deleteMany(ids: readonly PhotoId[]): Promise<void>;
}
