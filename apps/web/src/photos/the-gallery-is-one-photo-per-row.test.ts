import { describe, expect, it } from "vitest";

import { drawn, pixels, sheet } from "../testing/drawn.js";

/**
 * # An item's photographs, laid out the same way on both clients
 *
 * This client asked for `repeat(auto-fill, minmax(9rem, 1fr))`, which is two
 * across on a phone. The phone drew one per row, full width. Nothing justified
 * the difference — it was two people solving the same problem on the same day.
 *
 * One per row wins, and the controls are the argument. Every cell carries the
 * three things you can do to a photograph — make it the cover, move it
 * earlier, delete it — and at two across on a 360px screen the cell is about
 * 164px wide, so three controls with a 48px floor stack into a tower under
 * each picture. One per row gives them a row.
 *
 * It also gives the photograph the width, and the photograph is the thing
 * being checked: this screen is open because somebody wants to see whether the
 * drill in the picture is the drill they are looking for.
 *
 * ADR 22.
 */
const PHOTOS = sheet("photos/item-photos.css");

const MARKUP = `
  <div class="item-photos">
    <div class="item-photos__grid">
      <div class="item-photos__cell"><img class="photo" alt=""></div>
      <div class="item-photos__cell"><img class="photo" alt=""></div>
    </div>
  </div>`;

describe("this harness", () => {
  it("is applying the stylesheet it was handed", () => {
    expect(drawn(MARKUP, ".item-photos__grid", { sheets: [PHOTOS] }).display).toBe("flex");
  });
});

describe("an item's photographs", () => {
  it("are one per row, which is what the phone has always drawn", () => {
    expect(drawn(MARKUP, ".item-photos__grid", { sheets: [PHOTOS] }).flexDirection).toBe("column");
  });

  it("are separated by the twelve the phone puts between them", () => {
    expect(pixels(drawn(MARKUP, ".item-photos__grid", { sheets: [PHOTOS] }).rowGap)).toBe(12);
  });

  /**
   * The one number this client keeps that the phone has no use for. A phone is
   * always narrower than this, so the two clients draw the same thing on the
   * screen that matters; it stops a desktop from rendering a square photograph
   * the height of the window.
   */
  it("stop short of absurdity on a desktop, which no phone ever reaches", () => {
    expect(pixels(drawn(MARKUP, ".item-photos__cell", { sheets: [PHOTOS] }).maxWidth)).toBe(384);
  });
});
