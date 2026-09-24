import {
  describeFailure,
  photoReadFailureMessage,
  type Message,
  type PhotoReadFailure,
} from "@waymark/i18n";

/**
 * The file is there and the browser will not read it.
 *
 * It satisfies `PhotoReadFailure` by having `reason`, which is how
 * `@waymark/i18n` says it in two languages without knowing what a
 * `DOMException` is.
 */
export class PhotoCouldNotBeRead extends Error implements PhotoReadFailure {
  /** The browser's own words — `NotReadableError` and what it said about it. */
  readonly reason: string;

  constructor(reason: string) {
    super(`The photo could not be read: ${reason}`);
    this.name = "PhotoCouldNotBeRead";
    this.reason = reason;
  }
}

/**
 * # Proving the browser can read the file before the request is built
 *
 * `<input type="file">` hands back a HANDLE, not bytes. The bytes are read
 * when `fetch` builds the multipart body, which can be a long time later —
 * long enough for the file to be moved, renamed, deleted, unplugged or locked
 * by whatever wrote it. The browser then throws, `fetch` rejects with a
 * `TypeError`, and `send` turns that into `OFFLINE`, because from down there
 * a body that could not be produced and a network that is not there look
 * exactly alike.
 *
 * So the person was told to check a connection that was working, about a file
 * that was gone. The phone had the same bug through React Native's
 * `FormData`; this is the browser's half of it.
 *
 * ONE byte is read, which is the cheapest question that actually opens the
 * file. The whole photo is deliberately not read: the point of handing
 * `FormData` the `File` is that the browser streams it, and reading it here
 * to prove it is readable would put a photo in the heap to avoid putting a
 * photo in the heap.
 *
 * It does not close the window — the file can still go away between this byte
 * and the body — but it turns the ordinary case into the true sentence, and
 * the remaining case is genuinely indistinguishable from an outage.
 */
export const readablePhoto = async (file: File): Promise<File> => {
  if (file.size === 0) {
    throw new PhotoCouldNotBeRead(`${file.name} has nothing in it`);
  }

  try {
    await file.slice(0, 1).arrayBuffer();
  } catch (cause) {
    throw new PhotoCouldNotBeRead(wordsFor(cause));
  }

  return file;
};

/**
 * What to say about an upload that did not work.
 *
 * Everything the API refused still goes through `describeFailure`; the one
 * addition is the failure that never reached it.
 */
export const uploadFailureMessage = (error: unknown): Message =>
  error instanceof PhotoCouldNotBeRead
    ? photoReadFailureMessage(error)
    : describeFailure(error);

/**
 * The browser's own words, untranslated — the same bargain
 * `passkeys.deviceFailed` makes with a `DOMException`. The NAME is the part
 * worth carrying: `NotReadableError` is what a maintainer and a search engine
 * both recognise, and it is what somebody with no console can read out loud.
 */
const wordsFor = (cause: unknown): string => {
  if (!(cause instanceof Error)) {
    return String(cause);
  }

  return cause.name === "Error" ? cause.message : `${cause.name}: ${cause.message}`;
};
