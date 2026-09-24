import { describe, expect, it } from "vitest";

import { declarationsIn, drawn, pixels, sheet } from "../../testing/drawn.js";

/**
 * # Two of the four main screens are built out of these, and they split
 *
 * `RowLink` is the boxes inside a box and the whole tree on the home screen.
 * `SearchHit` is every unit a search finds. Both had the same disagreement, in
 * the same direction: this client drew a flat line with a 1px rule under it and
 * no background at all, and the phone drew a raised rounded row with air
 * around it.
 *
 * The flat-row idiom is a good one — for a mouse and a wide screen. Both of
 * these clients live on the same Android phone, and on a small dark screen a
 * column of hairline-separated rows reads as a web page wearing an app
 * costume. The phone's idiom wins (ADR 22).
 *
 * The one number that was a genuine choice rather than a convergence is the
 * row's height: 56 here against the phone's 48. 48 wins, because 48 is the
 * number this product already NAMES — `TAP_TARGET` in the shared tokens, the
 * floor under every button and every control in both clients — and 56 was a
 * second floor with no argument attached to it. 56 survives where it means
 * something else: `--bar-height`, the chrome at the top and bottom of the
 * screen, which is furniture rather than a row.
 */
const ROW = sheet("ui/molecules/row-link.css");
const HIT = sheet("search/views/search-hit.css");

const ROW_MARKUP = `
  <ul class="row-list">
    <li>
      <div class="row-link">
        <a class="row-link__target" href="/units/1">
          <span class="row-link__text">
            <span class="row-link__title">Metal wardrobe</span>
            <span class="row-link__meta">Wardrobe</span>
          </span>
        </a>
      </div>
    </li>
  </ul>`;

const HIT_MARKUP = `
  <ul class="search-hit-list">
    <li>
      <article class="search-hit">
        <a class="search-hit__link" href="/units/1">
          <span class="search-hit__title">Box 3</span>
          <span class="search-hit__where">Garage › Metal wardrobe</span>
        </a>
        <p class="search-hit__why">Matched tag</p>
      </article>
    </li>
  </ul>`;

/**
 * The control. Every assertion below reads a computed value, and a harness
 * that had not applied the stylesheet at all would answer every one of them
 * with an initial value rather than an error.
 */
describe("this harness", () => {
  it("is applying the stylesheets it was handed", () => {
    expect(drawn(ROW_MARKUP, ".row-link__target", { sheets: [ROW] }).display).toBe("flex");
  });
});

describe("a row in a list", () => {
  it("sits on the raised plane, which is what the phone gives it", () => {
    expect(drawn(ROW_MARKUP, ".row-link", { sheets: [ROW] }).background).toBe(
      "var(--color-surface-raised)",
    );
  });

  it("has the corners the phone gives it", () => {
    expect(pixels(drawn(ROW_MARKUP, ".row-link", { sheets: [ROW] }).borderRadius)).toBe(10);
  });

  /**
   * Read from the file, because jsdom computes a shorthand containing a
   * `var()` to exactly what it computes for no such declaration at all, so an
   * assertion about the rule being gone would pass with the rule still there.
   */
  it("still has a rule to its name, or the next assertion proves nothing", () => {
    expect(declarationsIn(ROW, ".row-link").trim()).not.toBe("");
  });

  it("is no longer separated from the next one by a hairline", () => {
    expect(declarationsIn(ROW, ".row-link")).not.toMatch(/border(?!-radius)/u);
  });

  it("is separated by air instead, the eight the phone uses", () => {
    expect(pixels(drawn(ROW_MARKUP, ".row-list", { sheets: [ROW] }).rowGap)).toBe(8);
  });

  /**
   * 48, and not 56. The floor this product names, rather than a second one.
   */
  it("is a thumb target at the height the whole product calls a thumb target", () => {
    expect(pixels(drawn(ROW_MARKUP, ".row-link__target", { sheets: [ROW] }).minHeight)).toBe(48);
  });
});

describe("a unit a search found", () => {
  it("sits on the raised plane too, so a result and a row are the same shape", () => {
    expect(drawn(HIT_MARKUP, ".search-hit", { sheets: [HIT] }).background).toBe(
      "var(--color-surface-raised)",
    );
  });

  it("has the same corners as a row", () => {
    expect(pixels(drawn(HIT_MARKUP, ".search-hit", { sheets: [HIT] }).borderRadius)).toBe(10);
  });

  it("still has a rule to its name, or the next assertion proves nothing", () => {
    expect(declarationsIn(HIT, ".search-hit").trim()).not.toBe("");
  });

  it("has lost its hairline as well", () => {
    expect(declarationsIn(HIT, ".search-hit")).not.toMatch(/border(?!-radius)/u);
  });

  it("is padded the way the phone pads it", () => {
    expect(pixels(drawn(HIT_MARKUP, ".search-hit", { sheets: [HIT] }).padding)).toBe(12);
  });

  it("is separated by the same air a row is", () => {
    expect(pixels(drawn(HIT_MARKUP, ".search-hit-list", { sheets: [HIT] }).rowGap)).toBe(8);
  });

  /** Unchanged, and worth keeping asserted: the breadcrumb IS the answer. */
  it("keeps the accent on the breadcrumb, which is what was actually asked for", () => {
    expect(drawn(HIT_MARKUP, ".search-hit__where", { sheets: [HIT] }).color).toBe(
      "var(--color-accent)",
    );
  });
});
