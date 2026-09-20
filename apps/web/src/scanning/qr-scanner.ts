/**
 * # The camera, behind a port
 *
 * Decoding a QR from a live camera is the one thing in this app that cannot
 * be driven from a test: jsdom has no `getUserMedia`, no video pipeline and
 * no pixels. So the camera is a port with one method, and the ZXing adapter
 * behind it is the only file in the app that knows what a video device is.
 *
 * This is not the same as stubbing the app's own code. The thing being stood
 * in for is a piece of hardware and a browser permission — genuinely outside
 * — while everything the scan screen then DOES with a decoded string is the
 * real code, driven by the real router, against the real API through MSW.
 */
export interface QrScanner {
  /**
   * Starts decoding into `video`, calling back for every symbol read, and
   * resolves to the function that stops the camera.
   *
   * Rejects with `CameraUnavailable` when there is no camera, or when the
   * person said no — which on a phone is a normal answer, not an error.
   */
  start(
    video: HTMLVideoElement,
    onDecoded: (text: string) => void,
  ): Promise<() => void>;
}

export class CameraUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CameraUnavailable";
  }
}
