import { describe, expect, it } from "vitest";

import { declarationsIn, drawn, pixels, sheet } from "../../testing/drawn.js";

/**
 * # The densest screen in the product, drawn the same way on both clients
 *
 * A unit's contents are a grid of these, three across, and they are what
 * somebody actually looks at while standing in front of a shelf. Nothing about
 * the cell matched. The browser drew a framed tile — a border, a radius, a
 * raised background, the caption inside the frame — and the phone drew a bare
 * photograph with its caption on the page. The photo box was SUNKEN on one and
 * RAISED on the other, which is not a difference of degree: one is a recess
 * and the other is a tile. The name was 550 on one and 600 on the other; the
 * line under it was 11.52px on one and 14 on the other, a 22% difference in
 * the one place a grid has any text at all.
 *
 * The owner's decision is that the phone's SHAPE wins and this client's
 * TYPOGRAPHIC DISCIPLINE wins, so the frame goes and every size here is one
 * the scale in `@waymark/tokens` actually publishes. ADR 22.
 *
 * ## Why this asks the cascade rather than reading the file
 *
 * The same reason `the-headings-are-on-the-scale.test.ts` does. A test that
 * greps a stylesheet for `font-size` passes just as happily for a rule inside
 * a media query that never matches, for one a later selector overrides, and
 * for one naming a token that does not exist. So the stylesheets go into a
 * document and the question is put to the DOM.
 *
 * jsdom does not resolve `var()`, so the tokens are resolved here from the
 * generated stylesheet itself. That is stronger than hardcoding pixels: it
 * proves the rule was given a TOKEN, and the token is then read from the one
 * file both clients are generated from.
 */
const CARD = sheet("items/views/item-card.css");

const styleOf = (markup: string, selector: string): CSSStyleDeclaration =>
  drawn(markup, selector, { sheets: [CARD] });

const blockFor = (selector: string): string => declarationsIn(CARD, selector);

const CARD_MARKUP = `
  <ul class="item-grid">
    <li class="item-card">
      <a class="item-card__target" href="/things/1">
        <span class="item-card__image">
          <span class="item-card__initials">CD</span>
          <span class="item-card__quantity">×8</span>
        </span>
        <span class="item-card__text">
          <span class="item-card__name">Cordless drill</span>
          <span class="item-card__secondary">Box 3</span>
        </span>
      </a>
    </li>
  </ul>`;

/**
 * The control. Every assertion below reads a computed value, and every one of
 * them would read `""` just as quietly if the stylesheet had not been applied
 * at all — which is the way a test like this goes green for the wrong reason.
 */
describe("this harness", () => {
  it("is actually applying the card's stylesheet", () => {
    expect(styleOf(CARD_MARKUP, ".item-card__image").aspectRatio).toBe("1 / 1");
  });
});

describe("the cell, which the phone draws as a bare photograph", () => {
  it("still has a rule to its name, or the next assertion proves nothing", () => {
    expect(blockFor(".item-card").trim()).not.toBe("");
  });

  it("has no frame drawn around it", () => {
    expect(blockFor(".item-card")).not.toMatch(/\bborder\b/u);
  });

  it("has no plate under it either, so the caption sits on the page", () => {
    const card = styleOf(CARD_MARKUP, ".item-card");

    // What an element with no background of its own computes to.
    expect(card.background).toBe("rgba(0, 0, 0, 0)");
    expect(card.borderRadius).toBe("");
  });

  /**
   * The radius moves from the frame to the picture, which is where the phone
   * has always had it. A square photograph with square corners in a grid of
   * three reads as a contact sheet rather than as a product.
   */
  it("rounds the picture instead", () => {
    expect(pixels(styleOf(CARD_MARKUP, ".item-card__image").borderRadius)).toBe(10);
  });
});

/**
 * The inversion. One client had a recess where the other had a tile, and the
 * empty state — which is most of a new inventory — is precisely where that
 * shows: forty cells with no photograph yet are forty grey squares, and
 * whether they read as holes or as tiles is the whole character of the screen.
 *
 * Both clients now use the RECESS, which is what this product's own token
 * vocabulary already said a photo's backing was. See ADR 22 for why this is
 * the one row of the audit where the phone moved instead of the browser.
 */
describe("the box the picture goes in", () => {
  it("is the sunken plane, the same recess a field is drawn in", () => {
    expect(styleOf(CARD_MARKUP, ".item-card__image").background).toBe(
      "var(--color-surface-sunken)",
    );
  });
});

describe("the grid", () => {
  it("puts eight between the columns, which is what the phone does", () => {
    expect(pixels(styleOf(CARD_MARKUP, ".item-grid").columnGap)).toBe(8);
  });

  /**
   * And twelve between the rows, also the phone's. The axes are deliberately
   * not equal: a caption at the bottom of one row and a photograph at the top
   * of the next need more air between them than two photographs side by side.
   */
  it("puts twelve between the rows, so a caption never crowds the next picture", () => {
    expect(pixels(styleOf(CARD_MARKUP, ".item-grid").rowGap)).toBe(12);
  });
});

describe("the writing on a card", () => {
  it("sets the name at 14, the size the phone sets it", () => {
    expect(pixels(styleOf(CARD_MARKUP, ".item-card__name").fontSize)).toBe(14);
  });

  it("sets the name at 600, and not the 550 nothing else in the product uses", () => {
    expect(styleOf(CARD_MARKUP, ".item-card__name").fontWeight).toBe("600");
  });

  /**
   * Two lines, as on the phone. A name is how somebody finds the thing they
   * came for, and "Brocas de pared de widia surtidas…" truncated at one line
   * is three cards that look identical.
   */
  it("lets the name run to a second line before giving up on it", () => {
    const name = styleOf(CARD_MARKUP, ".item-card__name");

    expect(name.getPropertyValue("-webkit-line-clamp")).toBe("2");
    expect(name.whiteSpace).not.toBe("nowrap");
  });

  /**
   * 14 and not 11.52. `0.72rem` was one of three sizes on this client that
   * were not on the scale this client publishes — the scale is 14/16/20/24 and
   * nothing named 11.52.
   */
  it("sets the line under it at 14 too, and not at a size off the scale", () => {
    expect(pixels(styleOf(CARD_MARKUP, ".item-card__secondary").fontSize)).toBe(14);
  });

  /**
   * Which leaves colour to do the separating, exactly as it does on the phone.
   * Two lines at the same size with the second one muted is a hierarchy; two
   * lines at 14 and 11.52 was a hierarchy AND a size nothing else used.
   */
  it("separates the two by ink rather than by size", () => {
    expect(styleOf(CARD_MARKUP, ".item-card__secondary").color).toBe("var(--color-ink-muted)");
  });

  /** `1.6rem` was 25.6px. The phone draws these at `text.xl`, which is 24. */
  it("draws the initials at 24, on the scale, with no invented tracking", () => {
    const initials = styleOf(CARD_MARKUP, ".item-card__initials");

    expect(pixels(initials.fontSize)).toBe(24);
    expect(initials.letterSpacing).toBe("");
  });
});

/**
 * The badge was the third off-scale size — `0.66rem`, which is 10.56px — and
 * the two clients disagreed about every property it has.
 *
 * The phone's version wins whole. Its plate is OPAQUE rather than 60% black:
 * both were solving the same problem, which is that this sits on a photograph
 * and a photograph can be any colour, but a translucent plate still lets a
 * bright picture through and an opaque one cannot. Being a token, it also
 * follows the light scheme, which `rgba(0, 0, 0, 0.6)` never did.
 */
describe("the quantity badge", () => {
  it("is the phone's small rounded plate rather than a pill", () => {
    expect(pixels(styleOf(CARD_MARKUP, ".item-card__quantity").borderRadius)).toBe(6);
  });

  it("is set at 14, on the scale", () => {
    expect(pixels(styleOf(CARD_MARKUP, ".item-card__quantity").fontSize)).toBe(14);
  });

  it("sits on an opaque plate that the light scheme can follow", () => {
    const badge = styleOf(CARD_MARKUP, ".item-card__quantity");

    expect(badge.background).toBe("var(--color-surface-sunken)");
    expect(badge.color).toBe("var(--color-ink)");
  });
});
