import { describe, expect, it } from "vitest";

import { PhotoCouldNotBeRead, readablePhoto } from "./readable-photo.js";

const aJpeg = (bytes = [255, 216, 255]): File =>
  new File([new Uint8Array(bytes)], "drill.jpg", { type: "image/jpeg" });

/** Refuses every read, the way a file that has been moved or locked does. */
const refusing = (thrown: unknown, file = aJpeg()): File => {
  for (const read of ["slice", "arrayBuffer", "stream", "text", "bytes"]) {
    Object.defineProperty(file, read, {
      value: () => {
        throw thrown;
      },
      configurable: true,
    });
  }

  return file;
};

const named = (name: string, message: string): Error =>
  Object.assign(new Error(message), { name });

/**
 * # One byte, asked before the request is built
 *
 * A `File` out of an input is a handle. The bytes are read when `fetch`
 * builds the body, and a handle that will not open by then becomes a `fetch`
 * rejection — which `send` reads as OFFLINE, because from down there a body
 * that could not be produced and a network that is not there look identical.
 *
 * So somebody was told to check a connection that was working, about a file
 * that was gone.
 */
describe("a photo on its way into a multipart body", () => {
  it("hands a readable photo straight through", async () => {
    const file = aJpeg();

    await expect(readablePhoto(file)).resolves.toBe(file);
  });

  /**
   * The whole point of giving `FormData` the `File` is that the browser
   * streams it. Reading the photo here to prove it is readable would put a
   * photo in the heap in order to avoid putting a photo in the heap.
   */
  it("reads one byte and never the whole photo", async () => {
    const asked: unknown[][] = [];
    const file = aJpeg();
    Object.defineProperty(file, "slice", {
      value: (...args: unknown[]) => {
        asked.push(args);

        return new Blob([new Uint8Array([255])]);
      },
      configurable: true,
    });
    for (const whole of ["arrayBuffer", "stream", "text", "bytes"]) {
      Object.defineProperty(file, whole, {
        value: () => {
          throw new Error(`the whole photo was read through ${whole}`);
        },
        configurable: true,
      });
    }

    await expect(readablePhoto(file)).resolves.toBe(file);
    expect(asked).toEqual([[0, 1]]);
  });

  it("refuses a photo the browser will not open", async () => {
    await expect(
      readablePhoto(refusing(named("NotReadableError", "The requested file could not be read"))),
    ).rejects.toBeInstanceOf(PhotoCouldNotBeRead);
  });

  /**
   * The NAME is the part worth carrying: `NotReadableError` is what a
   * maintainer and a search engine both recognise, and it is what somebody
   * with no console can read out loud.
   *
   * This is asserted on a plain `Error` carrying the name rather than on a
   * `DOMException`, deliberately. A browser's `DOMException` IS an `Error`;
   * jsdom's is NOT, so a test written with one would take the `String(cause)`
   * path here and prove nothing about the path production takes — while
   * still, by coincidence, containing the right words.
   */
  it("carries the browser's own name for the failure, and its words", async () => {
    await expect(
      readablePhoto(refusing(named("NotReadableError", "The requested file could not be read"))),
    ).rejects.toMatchObject({
      reason: "NotReadableError: The requested file could not be read",
    });
  });

  /** A throwable with nothing but a message says the message, not "Error: ". */
  it("does not prefix an anonymous failure with the word Error", async () => {
    await expect(readablePhoto(refusing(new Error("no permission")))).rejects.toMatchObject({
      reason: "no permission",
    });
  });

  it("says something about a failure that is not a throwable at all", async () => {
    await expect(readablePhoto(refusing("gone"))).rejects.toMatchObject({ reason: "gone" });
  });

  /** An empty file uploads perfectly well and is not a photo. */
  it("refuses a file with nothing in it", async () => {
    await expect(readablePhoto(aJpeg([]))).rejects.toBeInstanceOf(PhotoCouldNotBeRead);
  });
});
