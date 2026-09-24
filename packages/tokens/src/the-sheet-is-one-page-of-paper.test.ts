import { describe, expect, it } from "vitest";

import { LABELS_PER_PAGE, LABEL_SHEET } from "./label-sheet.js";
import { TAB_LABEL_WEIGHT } from "./scale.js";

/**
 * # The paper, and the one place its measurements are allowed to live
 *
 * A sheet of labels is printed by the browser from a stylesheet and by the
 * phone from a string of HTML handed to Android's print service. Two renderers,
 * one piece of paper — which is exactly the arrangement that gave this project
 * `tokens.css` and `tokens.ts` holding the same thirteen hex values, and ADR 22
 * to explain how that ended.
 *
 * So the millimetres are DATA here and neither client writes one down. These
 * tests are the arithmetic that has to keep holding for the paper to come out
 * of a printer the way it looks on a screen.
 */
describe("a page of labels", () => {
  it("fits three across and four down, which is twelve", () => {
    expect(LABELS_PER_PAGE).toBe(LABEL_SHEET.columns * LABEL_SHEET.rows);
    expect(LABELS_PER_PAGE).toBe(12);
  });

  /**
   * A4 is 210 × 297mm, and this is Spain. The printable box is that less the
   * margins, doubled, and if the two ever disagree the browser shrinks the
   * whole sheet to fit — silently, on a page that still looks like a page of
   * labels, with every symbol smaller than the size measured against a phone
   * camera.
   */
  it("is A4 less its own margins, on both edges", () => {
    expect(LABEL_SHEET.pageWidthMm + 2 * LABEL_SHEET.marginSideMm).toBe(210);
    expect(LABEL_SHEET.pageHeightMm + 2 * LABEL_SHEET.marginTopMm).toBe(297);
  });

  /**
   * The count is a SCANNING decision. A QR gets bigger as its error correction
   * goes up (ADR 9: level Q), so at a fixed label size every extra codeword
   * makes every module smaller until a phone camera stops resolving them. The
   * payload is around 35 characters, which at level Q is 33 modules plus a
   * 4-module quiet zone each side — 41 across. Phone cameras start failing at
   * about 0.4mm per module.
   */
  it("prints a symbol a phone camera can still resolve", () => {
    const modulesAcross = 41;

    expect(LABEL_SHEET.symbolMm / modulesAcross).toBeGreaterThan(0.4);
  });

  /** The symbol and its padding have to fit inside the cell that holds them. */
  it("leaves the symbol room inside its own cell", () => {
    const cellWidth = LABEL_SHEET.pageWidthMm / LABEL_SHEET.columns;

    expect(LABEL_SHEET.symbolMm + 2 * LABEL_SHEET.cellPaddingMm).toBeLessThan(cellWidth);
  });

  /** A label is printed. Dark paper is a cartridge, whichever scheme is on. */
  it("is black on white whatever colour scheme the screen is in", () => {
    expect(LABEL_SHEET.paper).toBe("#ffffff");
    expect(LABEL_SHEET.ink).toBe("#000000");
  });
});

/**
 * The word under a tab-bar icon. Both clients had their own answer — the
 * browser an unexplained 650, the phone whatever React Navigation defaults to —
 * and the owner saw the two bars side by side on one phone and the browser's
 * was the bolder. It is one decision now, in one place, like the size beside it.
 */
describe("the word under a tab-bar icon", () => {
  it("is one weight, and it is the weight this product's controls are set in", () => {
    expect(TAB_LABEL_WEIGHT).toBe(600);
  });
});
