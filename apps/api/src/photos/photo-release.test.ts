import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPhoto, markPhotoProcessed, photoId, type Photo } from "@waymark/domain";
import { InMemoryPhotoRepository } from "@waymark/domain/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PhotoFileStore } from "./photo-file-store.js";
import { PhotoRelease } from "./photo-release.js";

describe("PhotoRelease", () => {
  let root: string;
  let files: PhotoFileStore;
  let photos: InMemoryPhotoRepository;
  let release: PhotoRelease;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ariadna-release-"));
    files = new PhotoFileStore(root);
    photos = new InMemoryPhotoRepository();
    release = new PhotoRelease({ photos, files });
  });

  afterEach(async () => {
    // Undo anything a test made read-only, or the cleanup fails on Linux.
    await chmod(root, 0o755).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });

  const storeAPhoto = async (id: string): Promise<Photo> => {
    const paths = await files.write({
      id: photoId(id),
      format: "jpeg",
      original: Buffer.from("original"),
      thumbnail: Buffer.from("thumb"),
    });
    const photo = createPhoto({ id: photoId(id), ...paths });
    await photos.save(photo);

    return photo;
  };

  it("removes the rows and the files", async () => {
    const photo = await storeAPhoto("photo-1");

    const outcome = await release.release([photo.id]);

    expect(outcome.releasedPhotoIds).toEqual(["photo-1"]);
    expect(outcome.orphanedPaths).toEqual([]);
    expect(await photos.findById(photo.id)).toBeNull();
    expect(await files.open(photo.originalPath)).toBeNull();
    expect(await files.open(photo.thumbnailPath)).toBeNull();
  });

  it("also removes the processed variant when there is one", async () => {
    const photo = await storeAPhoto("photo-1");
    const processedPaths = await files.write({
      id: photoId("photo-1-processed"),
      format: "png",
      original: Buffer.from("processed"),
      thumbnail: Buffer.from("processed thumb"),
    });
    await photos.save(markPhotoProcessed(photo, processedPaths.originalPath));

    await release.release([photo.id]);

    expect(await files.open(processedPaths.originalPath)).toBeNull();
  });

  it("leaves other photos alone", async () => {
    const mine = await storeAPhoto("photo-1");
    const yours = await storeAPhoto("photo-2");

    await release.release([mine.id]);

    expect(await photos.findById(yours.id)).not.toBeNull();
    expect(await files.open(yours.originalPath)).not.toBeNull();
  });

  it("does nothing at all for an empty release", async () => {
    const photo = await storeAPhoto("photo-1");

    const outcome = await release.release([]);

    expect(outcome.releasedPhotoIds).toEqual([]);
    expect(await photos.findById(photo.id)).not.toBeNull();
  });

  it("is safe to run twice, because releasing is retried", async () => {
    const photo = await storeAPhoto("photo-1");
    await release.release([photo.id]);

    const second = await release.release([photo.id]);

    expect(second.orphanedPaths).toEqual([]);
  });

  it("forgets a row whose file was already gone by other means", async () => {
    const photo = await storeAPhoto("photo-1");
    await files.remove([photo.originalPath, photo.thumbnailPath]);

    const outcome = await release.release([photo.id]);

    expect(outcome.orphanedPaths).toEqual([]);
    expect(await photos.findById(photo.id)).toBeNull();
  });

  describe("when the filesystem refuses", () => {
    /**
     * THE decision this class exists to make. A read-only volume — a bad
     * reboot, a lost mount, a full disk — must not make deleting an item
     * impossible. The row goes, the file stays, and the leftover path is
     * reported so a sweep is `rm` rather than an investigation.
     */
    it("still deletes the row and reports the file as orphaned", async () => {
      const photo = await storeAPhoto("photo-1");
      const bucket = join(root, photo.originalPath.split("/")[0] as string);
      // Unlink needs write permission on the DIRECTORY, not on the file.
      await chmod(bucket, 0o555);

      const outcome = await release.release([photo.id]);

      try {
        expect(await photos.findById(photo.id)).toBeNull();
        expect(outcome.orphanedPaths).toEqual([
          photo.originalPath,
          photo.thumbnailPath,
        ]);
      } finally {
        await chmod(bucket, 0o755);
      }
    });

    it("never throws, so a delete request cannot fail on a disk problem", async () => {
      const photo = await storeAPhoto("photo-1");
      const bucket = join(root, photo.originalPath.split("/")[0] as string);
      await chmod(bucket, 0o555);

      try {
        await expect(release.release([photo.id])).resolves.toBeDefined();
      } finally {
        await chmod(bucket, 0o755);
      }
    });
  });
});
