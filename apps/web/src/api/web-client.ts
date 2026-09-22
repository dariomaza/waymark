import {
  createWaymarkClient,
  type WaymarkClient,
  type WaymarkClientOptions,
} from "@waymark/api-client";

/**
 * # The browser's half of the shared client
 *
 * `@waymark/api-client` holds everything that is true of the API whoever is
 * asking. It leaves exactly one thing open, and this is it: what a photo IS on
 * its way up.
 *
 * In a browser a photo is a `File` that came out of an `<input type="file">`,
 * and `FormData` already knows how to put one in a multipart body along with
 * the name the person's phone gave it. On Android it is a `file://` URI and
 * three strings, because turning that into a `File` would mean reading a
 * whole photo into the heap of the device that just took it.
 *
 * Those are not the same call, so the shared client does not pretend they are.
 * Four lines here, four lines there, and one HTTP layer.
 */
export type WebApiClient = WaymarkClient<File>;

export type WebApiClientOptions = Omit<WaymarkClientOptions<File>, "appendPhoto">;

export const createWebApiClient = (options: WebApiClientOptions): WebApiClient =>
  createWaymarkClient<File>({
    ...options,
    appendPhoto: (form, field, file) => {
      form.append(field, file, file.name);
    },
  });
