import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import type { PhotoId } from "@ariadna/domain";

import { extensionOf, type SupportedImageFormat } from "./image-format.js";

/**
 * # Photo files on a plain directory
 *
 * No S3, no MinIO, no blobs in SQLite. The deployment is one container on a
 * homelab box with a Docker volume mounted at the root this class is given.
 * A directory is something a person can back up with `rsync`, inspect with
 * `ls`, and restore by copying — which is worth more here than anything an
 * object store adds.
 *
 * Blobs in SQLite were rejected for a concrete reason: every photo would then
 * be inside the file that is also the inventory, so the database that should
 * stay small enough to copy anywhere becomes tens of gigabytes, and `VACUUM`
 * and every backup pay for it.
 *
 * ## The layout: one level of 256 buckets
 *
 * `<root>/<bucket>/<photoId>.<ext>` and `<root>/<bucket>/<photoId>.thumb.jpg`,
 * where the bucket is the first byte of `sha256(photoId)` in hex.
 *
 * Why bucket at all: a flat directory with tens of thousands of entries makes
 * every `readdir` a linear scan, and `readdir` is what a backup, a container
 * build and an impatient `ls` all do. Some filesystems degrade badly well
 * before that; overlayfs, which is what this will actually run on, is one.
 *
 * Why ONE level and not two: 256 buckets is sized to the real thing. A house
 * with 400 boxes and a couple of photos each is ~1,000 photos, so four per
 * bucket. At 100,000 photos — two orders of magnitude past anything plausible
 * here — it is still only ~390 files per directory, which no filesystem
 * notices. A second level would buy 65,536 buckets, and at realistic volumes
 * that is one nearly-empty directory per photo: thousands of inodes and a
 * `du` full of 4 KiB entries, to solve a problem this deployment will not have.
 *
 * Why a HASH of the id rather than its first characters: the id generator is a
 * port, and the current adapter happens to emit UUIDv4. Slicing the id itself
 * would silently stop distributing the moment that changes to anything with a
 * shared prefix — a timestamp-ordered id, for instance. Hashing is uniform for
 * any id shape, and it is one cheap digest on a path that is already doing
 * image encoding.
 */

/** Two hex characters: 256 buckets. See the reasoning above. */
export const PHOTO_BUCKET_LENGTH = 2;

/** Every thumbnail is a JPEG, whatever the original was. */
const THUMBNAIL_SUFFIX = ".thumb.jpg";

export interface WritePhotoFiles {
  readonly id: PhotoId;
  readonly format: SupportedImageFormat;
  readonly original: Buffer;
  readonly thumbnail: Buffer;
}

export interface StoredPhotoPaths {
  /** Relative to the root. What goes in the database. */
  readonly originalPath: string;
  readonly thumbnailPath: string;
}

export interface OpenedPhotoFile {
  readonly stream: NodeJS.ReadableStream;
  readonly byteSize: number;
}

export interface RemovalOutcome {
  readonly removed: readonly string[];
  /** Paths that could not be removed. The caller decides what that means. */
  readonly failed: readonly string[];
}

export class PhotoRootEscape extends Error {
  constructor(readonly path: string) {
    super(`Refusing to touch "${path}": it resolves outside the photo root`);
    this.name = "PhotoRootEscape";
  }
}

/**
 * The file name is reduced to `[A-Za-z0-9_-]`, dots included.
 *
 * Allowing dots would mean reasoning about `..`, about leading dots, and about
 * a second extension; forbidding them makes "this name cannot traverse and
 * cannot hide" true by inspection. The only dots in a stored path are the ones
 * this class puts there. Ids from `UuidIdGenerator` are unaffected.
 */
const safeFileName = (id: PhotoId): string => id.replace(/[^A-Za-z0-9_-]/gu, "_");

export class PhotoFileStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  get root(): string {
    return this.#root;
  }

  bucketOf(id: PhotoId): string {
    return createHash("sha256").update(id).digest("hex").slice(0, PHOTO_BUCKET_LENGTH);
  }

  pathsFor(id: PhotoId, format: SupportedImageFormat): StoredPhotoPaths {
    const bucket = this.bucketOf(id);
    const name = safeFileName(id);

    return {
      originalPath: `${bucket}/${name}.${extensionOf(format)}`,
      thumbnailPath: `${bucket}/${name}${THUMBNAIL_SUFFIX}`,
    };
  }

  /**
   * Writes both variants and answers with the paths to store.
   *
   * The paths come back rather than being derived later, because the layout is
   * an adapter decision that may change, and a row written under the old one
   * must keep pointing at the file it actually wrote.
   */
  async write(files: WritePhotoFiles): Promise<StoredPhotoPaths> {
    const paths = this.pathsFor(files.id, files.format);
    const original = this.#absolute(paths.originalPath);
    const thumbnail = this.#absolute(paths.thumbnailPath);

    await mkdir(dirname(original), { recursive: true });

    // The original first. If the process dies between the two, a photo with no
    // thumbnail is recoverable; a thumbnail with no original is not.
    await writeFile(original, files.original);
    await writeFile(thumbnail, files.thumbnail);

    return paths;
  }

  /**
   * Opens a stored file for STREAMING, never for buffering.
   *
   * A 2048px photo is a couple of megabytes. Reading it into memory to hand it
   * to the reply means the process holds one full image per concurrent request,
   * and a list view opens twenty at once. A read stream hands the socket the
   * bytes as they come off the disk and holds a 64 KiB window instead.
   */
  async open(relativePath: string): Promise<OpenedPhotoFile | null> {
    const absolute = this.#absolute(relativePath);

    let size: number;
    try {
      const stats = await stat(absolute);
      if (!stats.isFile()) {
        return null;
      }
      size = stats.size;
    } catch {
      return null;
    }

    return { stream: createReadStream(absolute), byteSize: size };
  }

  /**
   * Best effort, and it says so.
   *
   * Every failure is reported rather than thrown, because the caller has
   * already committed the database change by the time this runs: see
   * `PhotoRelease` for why that order is the right one. A path that could not
   * be unlinked is an orphan file to log, never a reason to fail a request.
   */
  async remove(relativePaths: readonly string[]): Promise<RemovalOutcome> {
    const removed: string[] = [];
    const failed: string[] = [];

    for (const relativePath of relativePaths) {
      try {
        await unlink(this.#absolute(relativePath));
        removed.push(relativePath);
      } catch (error) {
        // Already gone is the goal, not a failure. Releasing is retried, and a
        // retry must not start reporting problems once it has succeeded.
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          removed.push(relativePath);
          continue;
        }

        failed.push(relativePath);
      }
    }

    return { removed, failed };
  }

  /**
   * The root is a boundary.
   *
   * Every path that reaches the filesystem goes through here. Stored paths are
   * written by this class and should never be able to escape, but `GET
   * /photos/:id` takes an id from a client, and defence that only works while
   * every caller behaves is not defence.
   */
  #absolute(relativePath: string): string {
    const absolute = resolve(this.#root, relativePath);
    if (absolute !== this.#root && !absolute.startsWith(this.#root + sep)) {
      throw new PhotoRootEscape(relativePath);
    }

    return absolute;
  }
}

/** Exposed so the routes can build a path without reaching into the store. */
export const photoFilePath = (root: string, relativePath: string): string =>
  join(root, relativePath);
