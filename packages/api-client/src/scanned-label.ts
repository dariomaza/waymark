import { publicId, type PublicId } from "@ariadna/domain";

/**
 * # Reading the address printed on a box
 *
 * This is the front door of the product, and both clients open it: the PWA
 * from `/u/<code>` in the browser's URL bar or from its own camera, the
 * Android app from the same URL as a deep link or from `expo-camera`. Two
 * implementations of it would be two chances to stop reading a sticker that
 * is already glued to a box, so there is one.
 *
 * What a label encodes: `<public base>/u/<publicId>`.
 *
 * The host is deliberately ignored. `ARIADNA_PUBLIC_BASE_URL` is a server
 * setting that can change, labels already printed keep the old one, and a
 * client that only accepted its own origin would stop reading the stickers
 * already glued to the boxes. The shape of the path is what identifies an
 * Ariadna label; the id inside it is the stable thing (README).
 *
 * A bare code is accepted too, because the code is printed under the symbol
 * precisely so it can be read out and typed in when a label is scuffed.
 */
const CODE = /^[0-9A-HJKMNP-TV-Z]{10}$/u;

export const publicIdFromScannedText = (text: string): PublicId | null => {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }

  const bare = trimmed.toUpperCase();
  if (CODE.test(bare)) {
    return publicId(bare);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length !== 2 || segments[0] !== "u") {
    return null;
  }

  const code = (segments[1] ?? "").toUpperCase();

  return CODE.test(code) ? publicId(code) : null;
};
