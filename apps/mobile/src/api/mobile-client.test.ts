import { PHOTO_FIELD_NAME } from "@waymark/api-client";

import { appendPhotoPart, type PhotoUpload } from "./mobile-client.js";

/**
 * The one thing the two clients cannot share, pinned on its own.
 *
 * A browser hands the shared client a `File`; a phone hands it a local
 * `file://` URI and three strings, because turning that into a `File` would
 * mean holding a whole photo in the heap of the device that just took it.
 */
describe("what a phone puts in a multipart body", () => {
  it("appends the asset itself, under the field name the API reads", () => {
    const appended: { field: string; value: unknown }[] = [];
    const form = {
      append: (field: string, value: unknown) => {
        appended.push({ field, value });
      },
    } as unknown as FormData;

    const asset: PhotoUpload = {
      uri: "file:///tmp/drill.jpg",
      name: "drill.jpg",
      type: "image/jpeg",
    };

    appendPhotoPart(form, PHOTO_FIELD_NAME, asset);

    expect(appended).toEqual([{ field: "file", value: asset }]);
    // `@fastify/multipart` reads exactly this name on the other side.
    expect(PHOTO_FIELD_NAME).toBe("file");
  });
});
