import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { photoId } from "@ariadna/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PhotoFileStore, PHOTO_BUCKET_LENGTH } from "./photo-file-store.js";

const readStream = async (
  stream: NodeJS.ReadableStream,
): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};

describe("PhotoFileStore", () => {
  let root: string;
  let store: PhotoFileStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ariadna-photos-"));
    store = new PhotoFileStore(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const write = async (id: string) =>
    store.write({
      id: photoId(id),
      format: "jpeg",
      original: Buffer.from("original bytes"),
      thumbnail: Buffer.from("thumbnail bytes"),
    });

  describe("where files land", () => {
    it("writes both variants and answers with their relative paths", async () => {
      const written = await write("photo-1");

      expect(written.originalPath).toMatch(/^[0-9a-f]{2}\/photo-1\.jpg$/u);
      expect(written.thumbnailPath).toMatch(/^[0-9a-f]{2}\/photo-1\.thumb\.jpg$/u);
      expect(await readFile(join(root, written.originalPath), "utf8")).toBe(
        "original bytes",
      );
      expect(await readFile(join(root, written.thumbnailPath), "utf8")).toBe(
        "thumbnail bytes",
      );
    });

    it("keeps the format's extension on the original", async () => {
      const written = await store.write({
        id: photoId("photo-2"),
        format: "webp",
        original: Buffer.from("x"),
        thumbnail: Buffer.from("y"),
      });

      expect(written.originalPath.endsWith(".webp")).toBe(true);
      // The thumbnail is always JPEG, whatever the original is.
      expect(written.thumbnailPath.endsWith(".thumb.jpg")).toBe(true);
    });

    it("puts the two variants of one photo in the same bucket", async () => {
      const written = await write("photo-1");

      expect(written.originalPath.split("/")[0]).toBe(
        written.thumbnailPath.split("/")[0],
      );
    });

    it("gives the same photo the same bucket every time", async () => {
      const first = await write("photo-1");
      const second = await write("photo-1");

      expect(second.originalPath).toBe(first.originalPath);
    });

    /**
     * The whole reason for a bucket. A single directory with tens of thousands
     * of entries turns every `readdir` — which is what a backup, an `ls` and a
     * container image build all do — into a linear scan, and some filesystems
     * degrade badly long before that.
     */
    it("spreads photos across many directories", async () => {
      for (let index = 0; index < 200; index += 1) {
        await write(`photo-${index}`);
      }

      const buckets = await readdir(root);

      expect(buckets.length).toBeGreaterThan(50);
      expect(buckets.every((bucket) => bucket.length === PHOTO_BUCKET_LENGTH)).toBe(
        true,
      );
    });

    it("creates the root if nobody made it first", async () => {
      const fresh = new PhotoFileStore(join(root, "deeper", "still"));

      const written = await fresh.write({
        id: photoId("photo-1"),
        format: "png",
        original: Buffer.from("a"),
        thumbnail: Buffer.from("b"),
      });

      expect(
        (await stat(join(root, "deeper", "still", written.originalPath))).isFile(),
      ).toBe(true);
    });
  });

  describe("reading", () => {
    it("streams a stored file back with its size", async () => {
      const written = await write("photo-1");

      const opened = await store.open(written.originalPath);

      expect(opened).not.toBeNull();
      expect(opened?.byteSize).toBe("original bytes".length);
      expect((await readStream(opened!.stream)).toString("utf8")).toBe(
        "original bytes",
      );
    });

    it("answers null for a file that is not there", async () => {
      expect(await store.open("ab/missing.jpg")).toBeNull();
    });

    /**
     * Stored paths come from our own writes, so this should be unreachable.
     * It is enforced anyway: the day a path reaches this from anywhere else,
     * `../../../etc/passwd` must be a refusal and not a file read.
     */
    it.each([
      ["a parent traversal", "../../../etc/passwd"],
      ["a traversal hidden mid-path", "ab/../../../etc/passwd"],
      ["an absolute path", "/etc/passwd"],
    ])("refuses to read through %s", async (_name, path) => {
      await expect(store.open(path)).rejects.toThrow(/outside the photo root/u);
    });
  });

  describe("removing", () => {
    it("removes the files it is given", async () => {
      const written = await write("photo-1");

      await store.remove([written.originalPath, written.thumbnailPath]);

      expect(await store.open(written.originalPath)).toBeNull();
      expect(await store.open(written.thumbnailPath)).toBeNull();
    });

    it("reports nothing wrong when a file was already gone", async () => {
      const result = await store.remove(["ab/never-existed.jpg"]);

      expect(result.failed).toEqual([]);
    });

    it("keeps going after one path fails and reports the failures", async () => {
      const written = await write("photo-1");
      // A directory where a file is expected: unlink refuses, so this is a real
      // failure rather than a missing file.
      const blocked = "ab/a-directory.jpg";
      await store.remove([]);

      const result = await store.remove([
        written.originalPath,
        "../outside.jpg",
        blocked,
      ]);

      expect(await store.open(written.originalPath)).toBeNull();
      expect(result.failed).toContain("../outside.jpg");
    });

    it("leaves other photos alone", async () => {
      const mine = await write("photo-1");
      const yours = await write("photo-2");

      await store.remove([mine.originalPath, mine.thumbnailPath]);

      expect(await store.open(yours.originalPath)).not.toBeNull();
    });
  });

  describe("overwriting", () => {
    it("replaces the bytes of a photo written twice", async () => {
      await write("photo-1");

      const written = await store.write({
        id: photoId("photo-1"),
        format: "jpeg",
        original: Buffer.from("newer"),
        thumbnail: Buffer.from("newer thumb"),
      });

      expect(await readFile(join(root, written.originalPath), "utf8")).toBe("newer");
    });
  });

  describe("the root is a boundary, not a suggestion", () => {
    it("never writes outside it, whatever an id contains", async () => {
      const written = await write("../../escape");

      // One bucket, one file name, and no way to read `..` out of either.
      expect(written.originalPath.split("/")).toHaveLength(2);
      expect(written.originalPath).not.toContain("..");
      const inside = await readFile(join(root, written.originalPath), "utf8");
      expect(inside).toBe("original bytes");
    });

    it("refuses a stored path that would leave it", async () => {
      await writeFile(join(root, "decoy"), "not yours");

      await expect(store.open("../decoy")).rejects.toThrow(/outside the photo root/u);
    });
  });
});
