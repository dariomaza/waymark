import {
  createAriadnaClient,
  type AriadnaClient,
  type AriadnaClientOptions,
} from "@ariadna/api-client";

/**
 * # The browser's half of the shared client
 *
 * `@ariadna/api-client` holds everything that is true of the API whoever is
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
export type WebApiClient = AriadnaClient<File>;

export type WebApiClientOptions = Omit<AriadnaClientOptions<File>, "appendPhoto">;

export const createWebApiClient = (options: WebApiClientOptions): WebApiClient =>
  createAriadnaClient<File>({
    ...options,
    appendPhoto: (form, field, file) => {
      form.append(field, file, file.name);
    },
  });
