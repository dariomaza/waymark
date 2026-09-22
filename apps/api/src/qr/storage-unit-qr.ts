import type { PublicId } from "@waymark/domain";
import QRCode, { type QRCodeErrorCorrectionLevel } from "qrcode";

/**
 * # What the QR carries, and why it is not stored
 *
 * ## It encodes a URL, never a bare id
 *
 * The whole point of the printed label is that somebody in a garage, holding a
 * box, points the stock Android camera at it and lands on the page for that
 * box. Android's camera offers to OPEN a URL; it offers to copy a bare string.
 * Encoding `7ZQ4KM2XPT` would mean "install the app first, then open it, then
 * use the in-app scanner" — which is the workflow the QR exists to avoid.
 *
 * The URL is built from a configurable base (`ARIADNA_PUBLIC_BASE_URL`) so the
 * same code serves a tunnel hostname in production and localhost in
 * development. `/u/` is deliberately short: the shorter the payload, the fewer
 * modules in the symbol, and the bigger each module prints on a small label.
 *
 * ## It is generated on demand, not persisted
 *
 * The README originally said QR codes are "generated and persisted server-side
 * when a storage unit is created". That is departed from here, deliberately.
 *
 * A QR symbol is a PURE FUNCTION of the URL, and the URL is a pure function of
 * `publicId` and the configured base. Persisting it buys nothing and costs the
 * one thing that actually goes wrong: the base URL changes. Move the tunnel to
 * a real domain, or generate the first labels against `localhost` before the
 * hostname exists, and every persisted symbol is now a picture of a dead URL —
 * silently, with no error anywhere, until somebody scans a box and gets a
 * connection failure. Stored derived data has to be invalidated, and this one
 * has an invalidation trigger nobody would remember to wire up.
 *
 * Against that: rendering costs roughly a millisecond of CPU for a payload this
 * short, the result is fully cacheable by the client (see the route), and the
 * symbol is byte-for-byte identical for the same input, so a label printed
 * today matches one printed next year as long as the base URL has not moved.
 *
 * The thing that IS persisted and IS stable is `publicId`, which is what is
 * physically glued to the box. The picture of it is a rendering.
 */

/**
 * Level Q corrects ~25% of the symbol.
 *
 * These labels get printed on a cheap sticker, glued to a cardboard box, and
 * then live in a garage for years: dust, a scuff from a passing bike handlebar,
 * a corner lifting, a smear of paint.
 *
 * - **L (7%)** is what most libraries default to and is sized for a symbol on a
 *   screen. One good scuff and the label is decoration.
 * - **M (15%)** is the usual "general purpose" answer and would probably do.
 * - **Q (25%)** is the level printed-label and industrial-marking practice
 *   reaches for, for exactly this environment.
 * - **H (30%)** is NOT simply better. More recovery means more codewords means
 *   a larger symbol: at a FIXED physical label size, every module gets smaller.
 *   Past a point the camera stops resolving individual modules and the extra
 *   redundancy is spent fighting a problem it created. H is for symbols with a
 *   logo punched through the middle, which is not this.
 *
 * Q is the point where the damage budget is generous and the modules are still
 * comfortably large on a 40mm sticker.
 */
export const QR_ERROR_CORRECTION_LEVEL: QRCodeErrorCorrectionLevel = "Q";

/**
 * Four modules is the quiet zone the spec requires; the decoder needs it to
 * find the symbol at all. Two is enough in practice when the label is printed
 * on white stock with a border of its own, and it keeps the symbol larger.
 */
const QUIET_ZONE_MODULES = 4;

/** Wide enough to print at ~300dpi on a 40mm label without interpolation. */
const PNG_WIDTH_PX = 512;

/** The path segment a scanned label lands on. Short on purpose; see above. */
export const STORAGE_UNIT_PATH_PREFIX = "u";

/**
 * `<base>/u/<publicId>`.
 *
 * The public id is Crockford Base32 — upper case alphanumerics only — so it
 * drops into a path segment with no percent encoding, and the encoder can put
 * that run of the payload in QR alphanumeric mode (5.5 bits per character
 * instead of 8). The scheme and host around it are lower case and fall back to
 * byte mode, which is the honest cost of encoding a URL rather than an id.
 */
export const storageUnitUrl = (baseUrl: string, publicId: PublicId): string =>
  `${baseUrl.replace(/\/+$/u, "")}/${STORAGE_UNIT_PATH_PREFIX}/${publicId}`;

export const renderStorageUnitQrPng = async (url: string): Promise<Buffer> =>
  QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    margin: QUIET_ZONE_MODULES,
    width: PNG_WIDTH_PX,
    color: { dark: "#000000ff", light: "#ffffffff" },
  });

/**
 * SVG is the format that actually matters for printing: it is resolution
 * independent, so the same response prints crisply on a label printer and on an
 * A4 sheet of stickers, and it is a fraction of the bytes.
 */
export const renderStorageUnitQrSvg = async (url: string): Promise<string> =>
  QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    margin: QUIET_ZONE_MODULES,
    color: { dark: "#000000", light: "#ffffff" },
  });
