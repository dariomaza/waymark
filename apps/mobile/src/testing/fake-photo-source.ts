import type { PhotoUpload } from "../api/mobile-client.js";
import { PhotoPermissionRefused, type PhotoSource } from "../photos/photo-source.js";

export interface FakePhotoSource extends PhotoSource {
  /** What the next capture or pick answers with. */
  hands(photo: PhotoUpload | null): void;
  refuses(message: string): void;
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

  const answer = async (): Promise<PhotoUpload | null> => {
    if (refusal !== null) {
      throw new PhotoPermissionRefused(refusal);
    }

    return next;
  };

  return {
    capture: answer,
    pick: answer,
    hands(photo) {
      next = photo;
      refusal = null;
    },
    refuses(message) {
      refusal = message;
    },
  };
};
