import type { PhotoUpload } from "../api/mobile-client.js";
import { PhotoCouldNotBeRead } from "./photo-source.js";

/**
 * What the file system says about a URI, without reading a byte of it.
 *
 * `size` is `number | null` because the platform is allowed to decline: a
 * `null` is "I will not say", which is emphatically not "zero".
 */
export interface PhotoFile {
  readonly uri: string;
  readonly exists: boolean;
  readonly size: number | null;
}

/**
 * # The file system, behind a port
 *
 * The same line `PhotoSource` draws around the camera, drawn around the disk.
 * `expo-file-system` is a native module and a test runner has none; what this
 * app DECIDES about what the disk says is ordinary code and belongs under
 * test.
 *
 * Both members are allowed to throw or reject — a native module can be
 * missing, a grant can have expired, a volume can be full — and
 * `streamablePhoto` turns any of that into one refusal a person can read.
 */
export interface PhotoFiles {
  /** Metadata only; the bytes stay on disk. */
  inspect(uri: string): PhotoFile;
  /**
   * Copies into the app's own cache and answers for the copy. The copying is
   * the platform's, so the bytes still never enter this process.
   */
  copyIntoCache(uri: string): Promise<PhotoFile>;
}

/** The one scheme React Native streams straight off disk without a resolver. */
const LOCAL_FILE = "file://";

/**
 * # Proving the photo is readable before it becomes a request
 *
 * React Native's `FormData` takes `{ uri, name, type }` and opens that URI
 * natively when the request goes out. When it CANNOT open it, the networking
 * module reports `Could not retrieve file for uri …` as a request error, and
 * `fetch` rejects with the same `TypeError` a phone with no signal produces.
 * A read failure arrives as a network failure, and the person is sent to look
 * at a router.
 *
 * Nothing here can change what React Native does. What it can do is find out
 * first — and then say the true thing instead of the false one.
 *
 * A URI that is not a local file is copied into the cache rather than trusted.
 * Android's `ContentResolver` will often open a `content://` one, but the
 * grant behind it belongs to whichever app handed it over and can be revoked
 * between the tap and the upload. A copy either works now or fails now, where
 * there is still somebody looking at the screen.
 */
export const streamablePhoto = async (
  photo: PhotoUpload,
  files: PhotoFiles,
): Promise<PhotoUpload> => {
  const onDisk = photo.uri.startsWith(LOCAL_FILE)
    ? inspected(photo.uri, files)
    : await copied(photo.uri, files);

  if (!onDisk.exists) {
    throw new PhotoCouldNotBeRead(`there is no file at ${photo.uri}`);
  }

  /*
   * Zero is the camera's own failure mode rather than a hypothetical. The
   * file is created empty before the camera app is launched, so a camera that
   * wrote nothing into it leaves a real file of no length behind — which
   * uploads perfectly and is not a photo.
   */
  if (onDisk.size === 0) {
    throw new PhotoCouldNotBeRead(`the file at ${onDisk.uri} is empty`);
  }

  return { ...photo, uri: onDisk.uri };
};

const inspected = (uri: string, files: PhotoFiles): PhotoFile => {
  try {
    return files.inspect(uri);
  } catch (cause) {
    throw new PhotoCouldNotBeRead(wordsFor(cause));
  }
};

const copied = async (uri: string, files: PhotoFiles): Promise<PhotoFile> => {
  try {
    return await files.copyIntoCache(uri);
  } catch (cause) {
    throw new PhotoCouldNotBeRead(wordsFor(cause));
  }
};

/**
 * The platform's own sentence, untranslated — the same bargain
 * `failure.asTheApiPutIt` makes with the API's prose. It is what somebody
 * with no console can read out loud.
 */
const wordsFor = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
