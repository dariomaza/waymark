import * as ExpoClipboard from "expo-clipboard";

/**
 * # The system clipboard, behind a port
 *
 * Like the camera, the photo library and the keystore, this is the operating
 * system rather than this app: it is a native module, it does not exist under
 * a test runner, and what it does is observable only by asking the OS back.
 *
 * It answers whether it worked rather than throwing, because a refused copy
 * is a normal outcome and not an exception. A button that silently did
 * nothing would be the worst of the three possible behaviours; saying "copy
 * it by hand" is worse to read and true.
 */
export interface Clipboard {
  /** `true` when the string is now on the clipboard. */
  copy(value: string): Promise<boolean>;
}

export const expoClipboard = (): Clipboard => ({
  async copy(value: string): Promise<boolean> {
    try {
      return await ExpoClipboard.setStringAsync(value);
    } catch {
      return false;
    }
  },
});
