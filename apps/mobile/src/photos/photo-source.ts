import type { PhotoUpload } from "../api/mobile-client.js";

/**
 * # The camera and the photo library, behind a port
 *
 * Both are operating system screens: the app asks for one, Android puts its
 * own UI in front of everything, and what comes back is a `file://` URI. None
 * of that exists under a test runner, and neither does a lens.
 *
 * So they are a port with two methods, and `expo-image-picker` is the only
 * file in the app that knows what an intent is. This is the same line the web
 * client draws around its QR scanner: the thing being stood in for is
 * hardware and a permission dialog, genuinely outside — while everything the
 * app then DOES with the photo is the real upload, against the real client,
 * answered by the HTTP stub.
 *
 * `null` means the person backed out, which is an answer and not a failure.
 */
export interface PhotoSource {
  /** Opens the camera. */
  capture(): Promise<PhotoUpload | null>;
  /** Opens the photo library. */
  pick(): Promise<PhotoUpload | null>;
}

export class PhotoPermissionRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoPermissionRefused";
  }
}
