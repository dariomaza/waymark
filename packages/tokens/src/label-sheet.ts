/**
 * # The piece of paper, in millimetres, written once
 *
 * A sheet of printed labels is the one thing in this product that is not drawn
 * on a screen, and it is now drawn by TWO renderers: the browser lays it out
 * with a stylesheet and prints it, and the phone hands a string of HTML to
 * Android's print service (ADR 21, amended). Two renderers and one piece of
 * paper is exactly the arrangement that gave this project `tokens.css` and
 * `tokens.ts` holding the same thirteen hex values, kept in step by whoever
 * last remembered — and ADR 22 to explain how that ended.
 *
 * So the millimetres live here, as data, and neither client writes one down.
 * The browser reads them as custom properties out of the generated
 * `tokens.css`; the phone imports this object. Different mechanisms, one
 * guarantee, which is the same trade the palette already made.
 *
 * ## A4, because this is Spain
 *
 * 10mm at the sides and 12mm top and bottom. The extra 2mm is for the
 * browser's own header and footer, which CSS cannot switch off: the screen
 * asks the person to untick them, and the margin means a header printed anyway
 * lands in white space instead of on the first row of labels.
 *
 * 190 × 273mm is what is left, which is 3 columns by 4 rows of 63.3 × 68.2mm.
 *
 * ## Twelve is a scanning decision, not a packing one
 *
 * A QR gets BIGGER as its error correction goes up (ADR 9: level Q, 25%, which
 * is what a scuffed sticker in a garage needs), so at a fixed label size every
 * extra codeword makes every module smaller until a phone camera stops
 * resolving them. The payload is `<base>/u/<publicId>` — around 35 characters,
 * which at level Q is a 33-module symbol plus its 4-module quiet zone on each
 * side, 41 across. Printed at 36mm that is 0.88mm per module; a hostname long
 * enough to push it to 49 modules still gives 0.73mm. Both are comfortably past
 * the ~0.4mm where phone cameras start failing, and a 36mm symbol still leaves
 * room for a name somebody can read without a phone at all.
 *
 * Eighteen to a page was the other candidate — it matches a common off-the-shelf
 * A4 label sheet — and it was rejected because the cell is then 46mm tall:
 * either the symbol drops to ~28mm or the name does, and both of those are the
 * label's whole job.
 *
 * ## The four colours, which are NOT the palette
 *
 * Paper is white and ink is black in every colour scheme, because a label is
 * printed rather than looked at. They are deliberately not in `Palette`, which
 * is the thing that has a dark scheme and a light one; a token that changed
 * with the system theme would print a dark grey square a camera cannot read.
 */
export const LABEL_SHEET = {
  /** A4 (210 × 297) less the margins below. */
  pageWidthMm: 190,
  pageHeightMm: 273,
  marginSideMm: 10,
  marginTopMm: 12,
  columns: 3,
  rows: 4,
  /** The symbol, square. See the arithmetic above before moving it. */
  symbolMm: 36,
  cellPaddingMm: 3,
  cellGapMm: 1.5,
  /** The name, biggest and first: a wall of labels should read as a wall of names. */
  nameMm: 4.2,
  /** Two lines of a long name, then clipped — the code below is unambiguous. */
  nameMaxHeightMm: 9.7,
  /** Ten characters of Crockford Base32, to be read out loud across a garage. */
  codeMm: 3.2,
  /** Where it lives, for matching cut-out squares to boxes at the table. */
  whereMm: 2.6,
  /** The cut guide. Scissors follow it; adjacent labels share one. */
  cutGuideWidthMm: 0.2,
  paper: "#ffffff",
  ink: "#000000",
  cutGuide: "#999999",
  whereInk: "#444444",
} as const;

/**
 * # Why the pages are counted rather than left to the printer
 *
 * `break-inside: avoid` on a label stops one being cut in half. It does not
 * stop a ROW being pushed onto the next page, so a grid tall enough to overflow
 * gets broken wherever the paper runs out — and the preview then disagrees with
 * what comes out, which is worse than no preview.
 *
 * So the labels are chunked into pages of this many and the page break goes
 * between the chunks. The preview IS the pages.
 */
export const LABELS_PER_PAGE = LABEL_SHEET.columns * LABEL_SHEET.rows;
