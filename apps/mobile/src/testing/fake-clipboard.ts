import type { Clipboard } from "../ui/clipboard.js";

export interface FakeClipboard extends Clipboard {
  /** Every string this app has put on the clipboard, in order. */
  readonly copied: readonly string[];
  /** Makes every copy from here on fail, the way a refused permission does. */
  refuses(): void;
}

/**
 * The system clipboard, for a runner that has none.
 *
 * It keeps what it was handed, because the assertion worth making is the
 * exact string: a credential copied with a trailing newline, or an address
 * copied with a trailing slash, is a credential that does not work at the
 * other end.
 */
export const fakeClipboard = (): FakeClipboard => {
  const copied: string[] = [];
  let refusing = false;

  return {
    copied,
    async copy(value: string): Promise<boolean> {
      if (refusing) {
        return false;
      }

      copied.push(value);

      return true;
    },
    refuses() {
      refusing = true;
    },
  };
};
