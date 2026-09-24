import { PhotoCouldNotBeRead } from "./photo-source.js";
import { streamablePhoto, type PhotoFile, type PhotoFiles } from "./streamable-photo.js";

/**
 * # Proving the photo is there BEFORE the multipart body is built
 *
 * React Native's `FormData` takes `{ uri, name, type }` and streams the file
 * off disk, natively, when the request goes out. If it cannot open that file
 * it reports the failure as a NETWORK failure — `Network request failed`, a
 * `TypeError`, indistinguishable from a phone with no signal. The owner is
 * then told to check his connection about a file that was never there.
 *
 * The platform's half of that only exists on a device and is not testable
 * here; what IS testable is the decision this app makes first. So these say
 * what the app does with what the file system tells it, and nothing about
 * what React Native then does with the URI.
 */
const aFile = (over: Partial<PhotoFile> = {}): PhotoFile => ({
  uri: "file:///cache/ImagePicker/abc.jpeg",
  exists: true,
  size: 2_400_000,
  ...over,
});

interface Spy extends PhotoFiles {
  readonly copied: string[];
}

const fileSystem = (
  answers: { inspect?: () => PhotoFile; copy?: () => Promise<PhotoFile> } = {},
): Spy => {
  const copied: string[] = [];

  return {
    copied,
    inspect: answers.inspect ?? (() => aFile()),
    async copyIntoCache(uri) {
      copied.push(uri);

      return answers.copy === undefined
        ? aFile({ uri: "file:///cache/waymark-upload-1.jpeg" })
        : await answers.copy();
    },
  };
};

const drill = {
  uri: "file:///cache/ImagePicker/abc.jpeg",
  name: "abc.jpeg",
  type: "image/jpeg",
} as const;

describe("a photo on its way into a multipart body", () => {
  it("hands a local file through untouched, so the bytes never enter this process", async () => {
    const files = fileSystem();

    const ready = await streamablePhoto(drill, files);

    expect(ready).toEqual(drill);
    // No copy: the file is already where the networking layer can stream it.
    expect(files.copied).toEqual([]);
  });

  /**
   * A URI that is not a local file may still be readable — Android's
   * `ContentResolver` opens a `content://` one — but the grant behind it
   * belongs to another app and can be gone by the time the request goes out.
   * Copying into our own cache turns a whole class of failure into a copy
   * that either works now or says so now.
   */
  it("copies a URI that is not a local file into the cache, and posts the copy", async () => {
    const files = fileSystem();

    const ready = await streamablePhoto(
      { ...drill, uri: "content://media/picker/0/com.android.providers.media.photopicker/media/1" },
      files,
    );

    expect(files.copied).toEqual([
      "content://media/picker/0/com.android.providers.media.photopicker/media/1",
    ]);
    expect(ready.uri).toBe("file:///cache/waymark-upload-1.jpeg");
    // The name and the type are the API's, not the file system's.
    expect(ready.name).toBe("abc.jpeg");
    expect(ready.type).toBe("image/jpeg");
  });

  it("refuses a photo whose file is not there, rather than posting a body it cannot fill", async () => {
    const files = fileSystem({ inspect: () => aFile({ exists: false }) });

    await expect(streamablePhoto(drill, files)).rejects.toBeInstanceOf(PhotoCouldNotBeRead);
  });

  it("names the URI it could not find, so the failure can be reported", async () => {
    const files = fileSystem({ inspect: () => aFile({ exists: false }) });

    await expect(streamablePhoto(drill, files)).rejects.toMatchObject({
      reason: expect.stringContaining("file:///cache/ImagePicker/abc.jpeg"),
    });
  });

  /**
   * The camera's own failure mode: the file is created before the camera app
   * is launched, so a camera that wrote nothing leaves a real file of zero
   * bytes. Posting it would be a 4xx about a photo that is not a photo.
   */
  it("refuses a file with nothing in it", async () => {
    const files = fileSystem({ inspect: () => aFile({ size: 0 }) });

    await expect(streamablePhoto(drill, files)).rejects.toBeInstanceOf(PhotoCouldNotBeRead);
  });

  /**
   * `null` is the platform declining to answer, which is not the same as
   * answering zero. Treating it as empty would refuse perfectly good photos.
   */
  it("accepts a file the platform will not give a size for", async () => {
    const files = fileSystem({ inspect: () => aFile({ size: null }) });

    await expect(streamablePhoto(drill, files)).resolves.toEqual(drill);
  });

  it("carries the platform's own words when the read itself failed", async () => {
    const files = fileSystem({
      inspect: () => {
        throw new Error("EACCES: permission denied");
      },
    });

    await expect(streamablePhoto(drill, files)).rejects.toMatchObject({
      reason: "EACCES: permission denied",
    });
  });

  it("carries the platform's own words when the copy failed", async () => {
    const files = fileSystem({
      copy: () => Promise.reject(new Error("Unable to copy file: no space left on device")),
    });

    await expect(
      streamablePhoto({ ...drill, uri: "content://media/1" }, files),
    ).rejects.toMatchObject({
      reason: "Unable to copy file: no space left on device",
    });
  });
});
