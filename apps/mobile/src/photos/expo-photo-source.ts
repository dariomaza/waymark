import { File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import type { PhotoUpload } from "../api/mobile-client.js";
import { PhotoPermissionRefused, type PhotoSource } from "./photo-source.js";
import { streamablePhoto, type PhotoFile, type PhotoFiles } from "./streamable-photo.js";

/**
 * The adapter. The one file that knows `expo-image-picker` exists.
 *
 * The API sniffs the bytes and accepts only JPEG, PNG and WebP, so this asks
 * for images and lets the server have the last word rather than restating the
 * list. What it does insist on is a NAME and a TYPE: multipart without them
 * arrives as an anonymous blob, and the API's format sniffing would be reading
 * bytes for a part nobody could describe.
 */
const toUpload = (asset: ImagePicker.ImagePickerAsset): PhotoUpload => {
  const fallbackName = asset.uri.split("/").pop() ?? "photo.jpg";

  return {
    uri: asset.uri,
    name: asset.fileName ?? fallbackName,
    type: asset.mimeType ?? "image/jpeg",
  };
};

const firstOf = (
  result: ImagePicker.ImagePickerResult,
): PhotoUpload | null => {
  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  return asset === undefined ? null : toUpload(asset);
};

/** Metadata only. The bytes stay on disk, which is the whole point. */
const stateOf = (file: File): PhotoFile => ({
  uri: file.uri,
  exists: file.exists,
  size: file.size,
});

/**
 * The disk, as `expo-file-system` has it.
 *
 * `File.copy` is native, so a copy still never brings a photo through the
 * JavaScript heap — the same property `{ uri, name, type }` exists to
 * preserve on the way up.
 */
export const expoPhotoFiles = (): PhotoFiles => ({
  inspect: (uri) => stateOf(new File(uri)),

  async copyIntoCache(uri) {
    /*
     * The copy carries no extension on purpose. What it is called on the wire
     * is `PhotoUpload.name`, which travels separately and is unchanged, and
     * the API sniffs the bytes rather than trusting either. A suffix here
     * would be a third opinion about the format with nothing behind it.
     */
    const target = new File(
      Paths.cache,
      `waymark-upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    );

    await new File(uri).copy(target);

    return stateOf(target);
  },
});

/**
 * # Why every picked photo is checked before it becomes a request
 *
 * Photographing a thing failed while choosing one from the library worked,
 * and the sentence the owner read was that the app could not connect to
 * Waymark. Nothing had reached the API — the request was never made.
 *
 * React Native's `FormData` takes a local URI and opens it natively when the
 * request goes out; a file it cannot open is reported as a request error and
 * `fetch` rejects with the same `TypeError` a phone with no signal produces.
 * A READ failure arrives as a NETWORK failure and there is nothing further
 * down the stack that can tell them apart.
 *
 * So the check happens here, where the URI is still just a URI, and
 * `streamablePhoto` decides what to do about the answer.
 */
export const expoPhotoSource = (
  files: PhotoFiles = expoPhotoFiles(),
): PhotoSource => {
  const ready = async (
    result: ImagePicker.ImagePickerResult,
  ): Promise<PhotoUpload | null> => {
    const picked = firstOf(result);

    return picked === null ? null : await streamablePhoto(picked, files);
  };

  return {
    async capture() {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new PhotoPermissionRefused(
          "Waymark needs permission to use the camera before it can take a photo.",
        );
      }

      return await ready(
        await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          // The photo is re-encoded, re-oriented and stripped of EXIF by the API
          // anyway; what matters here is not sending 12 megapixels over a home
          // connection from a garage.
          quality: 0.8,
        }),
      );
    },

    async pick() {
      return await ready(
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.8,
        }),
      );
    },
  };
};
