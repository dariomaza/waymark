import {
  createAriadnaClient,
  type AriadnaClient,
  type AriadnaClientOptions,
} from "@ariadna/api-client";

/**
 * # The phone's half of the shared client
 *
 * `@ariadna/api-client` holds everything that is true of the API whoever is
 * asking. It leaves exactly one thing open, and this is it: what a photo IS on
 * its way up.
 *
 * A browser has a `File` straight out of an `<input type="file">`. A phone has
 * a `file://` URI that `expo-image-picker` handed back, and reading it into a
 * `File` would mean holding a whole photo in the JavaScript heap of the device
 * that just took it — twice, once as bytes and once as multipart. React
 * Native's `FormData` takes `{ uri, name, type }` instead and streams the file
 * off disk, which is why it is spelled that way and not as a `Blob`.
 *
 * The cast is the honest shape of that: the platform's `FormData` accepts this
 * object and its type definitions, which describe a browser's, do not.
 */
export interface PhotoUpload {
  /** A local `file://` URI; the bytes never enter this process. */
  readonly uri: string;
  readonly name: string;
  readonly type: string;
}

export type MobileApiClient = AriadnaClient<PhotoUpload>;

export type MobileApiClientOptions = Omit<
  AriadnaClientOptions<PhotoUpload>,
  "appendPhoto"
>;

export const createMobileApiClient = (
  options: MobileApiClientOptions,
): MobileApiClient =>
  createAriadnaClient<PhotoUpload>({
    ...options,
    appendPhoto: (form, field, photo) => {
      form.append(field, photo as unknown as Blob);
    },
  });
