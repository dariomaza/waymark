import type { PhotoUpload } from "../api/mobile-client.js";
import {
  PhotoCouldNotBeRead,
  PhotoPermissionRefused,
  type PhotoSource,
} from "../photos/photo-source.js";

export interface FakePhotoSource extends PhotoSource {
  /** What the next capture or pick answers with. */
  hands(photo: PhotoUpload | null): void;
  refuses(message: string): void;
  /**
   * The photo was taken and the app cannot read the file behind it — which
   * is what a camera looks like when it goes wrong, and what React Native
   * reports as a network failure unless somebody checks first.
   */
  cannotRead(reason: string): void;
}

/**
 * The camera roll and the camera, for a runner that has neither.
 *
 * What comes back is the same `{ uri, name, type }` `expo-image-picker`
 * produces, so the upload the app then builds is the real multipart request.
 */
export const fakePhotoSource = (): FakePhotoSource => {
  let next: PhotoUpload | null = {
    uri: "file:///tmp/drill.jpg",
    name: "drill.jpg",
    type: "image/jpeg",
  };
  let refusal: string | null = null;
  let unreadable: string | null = null;

  const answer = async (): Promise<PhotoUpload | null> => {
    if (refusal !== null) {
      throw new PhotoPermissionRefused(refusal);
    }
    if (unreadable !== null) {
      throw new PhotoCouldNotBeRead(unreadable);
    }

    return next;
  };

  return {
    capture: answer,
    pick: answer,
    hands(photo) {
      next = photo;
      refusal = null;
      unreadable = null;
    },
    refuses(message) {
      refusal = message;
    },
    cannotRead(reason) {
      unreadable = reason;
    },
  };
};
