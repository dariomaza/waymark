import * as ImagePicker from "expo-image-picker";

import type { PhotoUpload } from "../api/mobile-client.js";
import { PhotoPermissionRefused, type PhotoSource } from "./photo-source.js";

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

export const expoPhotoSource = (): PhotoSource => ({
  async capture() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new PhotoPermissionRefused(
        "Ariadna needs permission to use the camera before it can take a photo.",
      );
    }

    return firstOf(
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
    return firstOf(
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      }),
    );
  },
});
