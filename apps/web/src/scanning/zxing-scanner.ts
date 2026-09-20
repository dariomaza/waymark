import { CameraUnavailable, type QrScanner } from "./qr-scanner.js";

/**
 * The real camera, through `@zxing/browser`.
 *
 * The library is imported dynamically: it is a few hundred kilobytes of
 * decoder that most sessions never open, and this app is expected to start on
 * a phone in the corner of a garage. The scan screen is the only thing that
 * pays for it, and only when it is opened.
 */
export const createZxingScanner = (): QrScanner => ({
  async start(video, onDecoded) {
    let reader;
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      reader = new BrowserQRCodeReader();
    } catch (cause) {
      throw new CameraUnavailable(`the QR reader could not be loaded: ${String(cause)}`);
    }

    try {
      const controls = await reader.decodeFromVideoDevice(
        // No device id: let the browser pick, which on a phone means the back
        // camera it already knows is pointed away from the face.
        undefined,
        video,
        (result) => {
          if (result !== undefined) {
            onDecoded(result.getText());
          }
        },
      );

      return () => {
        controls.stop();
      };
    } catch (cause) {
      // A refused permission, a camera another app is holding, or a page not
      // served over HTTPS. All of them mean the same thing here: type it in.
      throw new CameraUnavailable(String(cause));
    }
  },
});
