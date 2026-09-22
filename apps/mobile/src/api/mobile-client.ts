import {
  createWaymarkClient,
  type AppendPhoto,
  type WaymarkClient,
  type WaymarkClientOptions,
} from "@waymark/api-client";

/**
 * # The phone's half of the shared client
 *
 * `@waymark/api-client` holds everything that is true of the API whoever is
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

export type MobileApiClient = WaymarkClient<PhotoUpload>;

/**
 * Puts a photo into the multipart body the way React Native expects.
 *
 * Exported so it can be pinned on its own. It is the one line in this app
 * whose real behaviour only exists on a device: React Native's `FormData`
 * recognises `{ uri, name, type }` and streams the file off disk, while the
 * `FormData` a test runner has is the platform one, which stringifies
 * anything that is not a `Blob`. So the test says what is appended and under
 * which name, and the streaming is the platform's to keep.
 */
export const appendPhotoPart: AppendPhoto<PhotoUpload> = (form, field, photo) => {
  form.append(field, photo as unknown as Blob);
};

export type MobileApiClientOptions = Omit<
  WaymarkClientOptions<PhotoUpload>,
  "appendPhoto"
>;

export const createMobileApiClient = (
  options: MobileApiClientOptions,
): MobileApiClient =>
  createWaymarkClient<PhotoUpload>({ ...options, appendPhoto: appendPhotoPart });
