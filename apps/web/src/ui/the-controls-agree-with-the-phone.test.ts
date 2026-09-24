import { describe, expect, it } from "vitest";

import { declarationsIn, drawn, pixels, sheet } from "../testing/drawn.js";

/**
 * # The small disagreements, which are the ones that add up
 *
 * None of these is visible on its own. Together they are why two clients of
 * one product, side by side on one phone, read as two products: a destructive
 * button filled on one and outlined on the other, a note whose accent edge is
 * lime here and invisible grey there, a field drawn on the page's own surface
 * here and in a recess there, an empty screen with twice the padding here.
 *
 * Every assertion below names the phone's value, because the phone is what the
 * owner holds. The four exceptions — where this client was the one being
 * deliberate and the phone moved instead — are named where they appear.
 *
 * ADR 22.
 */
const BUTTON = sheet("ui/atoms/button.css");
const CALLOUT = sheet("ui/atoms/callout.css");
const EMPTY = sheet("ui/molecules/empty-note.css");
const FIELD = sheet("ui/atoms/text-field.css");
const CRUMB = sheet("ui/molecules/breadcrumb.css");
const SHEET = sheet("ui/organisms/sheet.css");
const AVATAR = sheet("ui/atoms/avatar.css");

/**
 * The control. Every assertion below reads a computed value, and a harness
 * that had applied no stylesheet would answer with initial values rather than
 * with an error.
 */
describe("this harness", () => {
  it("is applying the stylesheets it was handed", () => {
    expect(
      pixels(drawn(`<button class="button"></button>`, ".button", { sheets: [BUTTON] }).minHeight),
    ).toBe(48);
  });
});

/**
 * # The tone that deletes things
 *
 * This client filled it: a salmon rectangle with dark ink. The phone outlined
 * it: the raised surface, a danger border, danger text. It is Sign out, every
 * Delete, every Revoke and every destructive line in every overflow menu — so
 * it is the single most-seen disagreement in the product.
 *
 * The phone's wins, and it agrees with a rule this codebase already had. ADR
 * 21 gives a screen exactly ONE filled rectangle, the primary, and says the
 * eye should land on it before anybody has read a word. A second filled
 * rectangle in a loud colour competes for precisely that, and the thing it
 * competes with the hardest is the thing you meant to press.
 *
 * The word stays readable: 7.61 in the dark and 6.87 in the light, both
 * asserted in `@waymark/tokens` rather than claimed here.
 */
describe("a button that takes something away", () => {
  const DANGER = `<button class="button button--danger">Delete</button>`;

  it("is outlined rather than filled, which is what the phone draws", () => {
    const button = drawn(DANGER, ".button--danger", { sheets: [BUTTON] });

    expect(button.background).toBe("var(--color-surface-raised)");
    expect(button.color).toBe("var(--color-danger)");
  });

  /** `border-color` is a shorthand, so this one goes to the file. */
  it("takes its edge from the danger token", () => {
    expect(declarationsIn(BUTTON, ".button--danger")).toContain(
      "border-color: var(--color-danger);",
    );
  });

  /** The one filled rectangle on a screen stays the one the screen is FOR. */
  it("leaves the filled rectangle to the primary action", () => {
    expect(drawn(`<button class="button button--primary"></button>`, ".button--primary", {
      sheets: [BUTTON],
    }).background).toBe("var(--color-accent)");
  });
});

describe("a quiet button", () => {
  it("is padded like every other button, which is what the phone does", () => {
    expect(declarationsIn(BUTTON, ".button--quiet")).not.toMatch(/padding/u);
  });

  it("still has a rule to its name, or that assertion proves nothing", () => {
    expect(declarationsIn(BUTTON, ".button--quiet").trim()).not.toBe("");
  });
});

/**
 * # A callout says something, so it is drawn as something said
 *
 * Its body was muted ink here and full ink on the phone. Muted is what this
 * app draws things that are NOT the content with; a refusal about the world is
 * the content. The phone's wins.
 *
 * The note's left edge went the other way, and it is the clearest case in the
 * audit of this client being the one that was right: lime here, `colors.line`
 * on the phone — a grey edge on a grey plate, which is a 4px stripe nobody can
 * see. An accent edge that does not read is not a quieter accent, it is an
 * absent one.
 */
describe("a callout", () => {
  const NOTE = `<div class="callout callout--note"><div class="callout__text">Still working</div></div>`;

  it("says what it has to say in the ink the content is written in", () => {
    expect(drawn(NOTE, ".callout__text", { sheets: [CALLOUT] }).color).toBe("var(--color-ink)");
  });

  it("marks a note with the accent, which is the edge the phone could not see", () => {
    expect(drawn(NOTE, ".callout--note", { sheets: [CALLOUT] }).borderLeftColor).toBe(
      "var(--color-accent)",
    );
  });

  it("keeps a refusal about the world and a refusal about the request apart", () => {
    const blocked = `<div class="callout callout--blocked"></div>`;
    const wrong = `<div class="callout callout--wrong"></div>`;

    expect(drawn(blocked, ".callout--blocked", { sheets: [CALLOUT] }).borderLeftColor).toBe(
      "var(--color-warning)",
    );
    expect(drawn(wrong, ".callout--wrong", { sheets: [CALLOUT] }).borderLeftColor).toBe(
      "var(--color-danger)",
    );
  });
});

describe("an empty screen", () => {
  const EMPTY_MARKUP = `
    <div class="empty-note">
      <p class="empty-note__text">Nothing in here yet</p>
      <p class="empty-note__explains">This is where the boxes go</p>
    </div>`;

  /** A two-value `padding` is a shorthand, so this one goes to the file. */
  it("is padded the way the phone pads it, and not at twice the height", () => {
    expect(declarationsIn(EMPTY, ".empty-note")).toContain("padding: var(--space-4)");
  });

  /**
   * 16 rather than 14. It is the one line explaining what a place is FOR, on a
   * screen with nothing else on it, and the phone sets it at body size.
   */
  it("sets the line explaining the place at body size, as the phone does", () => {
    expect(pixels(drawn(EMPTY_MARKUP, ".empty-note__explains", { sheets: [EMPTY] }).fontSize)).toBe(
      16,
    );
  });

  /** Unchanged on both, and the reason the note is not a box any more. */
  it("still says the sentence itself in title-sized normal ink", () => {
    const text = drawn(EMPTY_MARKUP, ".empty-note__text", { sheets: [EMPTY] });

    expect(pixels(text.fontSize)).toBe(20);
    expect(text.color).toBe("var(--color-ink)");
  });
});

describe("a field", () => {
  const FIELD_MARKUP = `
    <div class="field">
      <label class="field__label">Name</label>
      <div class="field__control"><input class="field__input"></div>
      <textarea class="field__input field__input--area"></textarea>
    </div>`;

  /**
   * The recess. A field is a hole you type into, and `sunken` is this
   * product's token for a recess — which is what made the item card's raised
   * photo box the outlier it turned out to be. This client drew fields on the
   * page's own surface, so the box and the page were the same plane.
   */
  it("is drawn in the recess the phone draws it in", () => {
    expect(drawn(FIELD_MARKUP, ".field__input", { sheets: [FIELD] }).background).toBe(
      "var(--color-surface-sunken)",
    );
  });

  /** A label is what the field IS, not an aside about it. */
  it("labels itself in normal ink, as the phone does", () => {
    expect(drawn(FIELD_MARKUP, ".field__label", { sheets: [FIELD] }).color).toBe(
      "var(--color-ink)",
    );
  });

  /**
   * The one field disagreement the PHONE lost. A multiline box with no minimum
   * is a one-line-tall box that happens to accept newlines, which tells
   * somebody the opposite of what it means.
   */
  it("keeps a multiline box tall enough to look like one", () => {
    expect(
      pixels(drawn(FIELD_MARKUP, ".field__input--area", { sheets: [FIELD] }).minHeight),
    ).toBe(84);
  });
});

/**
 * # Where a thing is, one tappable step at a time
 *
 * Three disagreements in one small control: the separator was `>` here and `›`
 * on the phone, its ink was `line` here and `inkMuted` there, and the step was
 * 32 tall here against roughly 22 there.
 *
 * The glyph and the ink go to the phone. The HEIGHT goes to neither, because
 * neither was right: this product's floor is 48 and both clients were under
 * it. ADR 21 already settled the principle for `QuietLink` — a control may be
 * small to look at and may not be small to hit — and a breadcrumb is exactly
 * that shape. Steps sit side by side, so the row costs 48 once rather than
 * once per step.
 */
describe("a breadcrumb", () => {
  const CRUMB_MARKUP = `
    <nav class="breadcrumb">
      <ol class="breadcrumb__list">
        <li class="breadcrumb__step"><a href="/units/1">Garage</a></li>
        <li class="breadcrumb__step"><a href="/units/2">Metal wardrobe</a></li>
      </ol>
    </nav>`;

  /**
   * Read from the file: this is the `content` of a `::before`, and jsdom does
   * not resolve pseudo-element content reliably enough to assert on.
   */
  it("separates its steps with the glyph the phone uses", () => {
    expect(declarationsIn(CRUMB, ".breadcrumb__step + .breadcrumb__step::before")).toContain(
      'content: "›"',
    );
  });

  it("draws that separator in ink rather than in the colour of a rule", () => {
    expect(
      declarationsIn(CRUMB, ".breadcrumb__step + .breadcrumb__step::before"),
    ).toContain("var(--color-ink-muted)");
  });

  it("is a thumb target, which neither client had made it", () => {
    expect(pixels(drawn(CRUMB_MARKUP, ".breadcrumb__step a", { sheets: [CRUMB] }).minHeight)).toBe(
      48,
    );
  });
});

/**
 * The panel's own chrome. Two small disagreements, both going to the phone.
 *
 * The backdrop was 55% here and 67% there — the same idea at two strengths,
 * which on a dark screen is the difference between a page that is dimmed and
 * one that is plainly behind something.
 *
 * The head's rule is the one that carries an argument. The head holds the
 * title and the way out and stays put while the body scrolls; the rule is what
 * says so before anybody has scrolled. This client had the scrolling and not
 * the line that explains it.
 */
describe("the panel a question is asked in", () => {
  const SHEET_MARKUP = `
    <div class="sheet__backdrop">
      <div class="sheet">
        <div class="sheet__head"><h3>Delete Box 3</h3></div>
        <div class="sheet__body"></div>
      </div>
    </div>`;

  /**
   * Character for character the string the phone's `Sheet` now carries, which
   * is as close to a shared value as two platforms with no common stylesheet
   * can get for a colour that is not a token.
   */
  it("dims the page behind it as far as the phone dims it", () => {
    expect(drawn(SHEET_MARKUP, ".sheet__backdrop", { sheets: [SHEET] }).background).toBe(
      "rgba(0, 0, 0, 0.67)",
    );
  });

  it("still has a head to rule off, or the next assertion proves nothing", () => {
    expect(declarationsIn(SHEET, ".sheet__head").trim()).not.toBe("");
  });

  /** `border-bottom` is a shorthand, so this one goes to the file. */
  it("rules off the part that does not move, as the phone does", () => {
    expect(declarationsIn(SHEET, ".sheet__head")).toContain(
      "border-bottom: 1px solid var(--color-line);",
    );
  });

  /** Unchanged, and the reason the rule means anything: only the body scrolls. */
  it("still scrolls the body and nothing else", () => {
    expect(drawn(SHEET_MARKUP, ".sheet__body", { sheets: [SHEET] }).overflowY).toBe("auto");
  });
});


/**
 * # The circle with your initial in it, now that this client has one in the bar
 *
 * ADR 22 listed the tab bar's avatar under "what stays different, on purpose",
 * and the reason was about the BAR: filled, at that size, in the accent, it
 * reads as the selected tab whichever tab you are actually on. At the time only
 * the phone had one there — this client's lived in the top bar, where filled
 * was right.
 *
 * The account is the fifth destination here too now, so that argument reaches
 * this client and the exception is spent: a ring in the bar, on both, and a
 * filled disc on the account screen, on both. The circle you tapped and the
 * circle you arrived at are the same drawing.
 *
 * The border is the icon set's own stroke weight, so the circle and the four
 * drawings beside it in the bar are one line rather than two.
 */
describe("a person, as a circle with their initial in it", () => {
  const MARKUP = `<span class="avatar">D</span>`;

  it("is a ring in the bar, not a filled disc that reads as the selected tab", () => {
    const avatar = drawn(MARKUP, ".avatar", { sheets: [AVATAR] });

    expect(avatar.background).not.toBe("var(--color-accent)");
    expect(pixels(avatar.borderTopWidth)).toBe(1.7);
  });

  /** The same weight every drawing in the set is stroked at (ADR 20). */
  it("is drawn at the icon set's stroke weight, so the bar is one line", () => {
    expect(declarationsIn(AVATAR, ".avatar")).toContain("border: 1.7px solid currentColor;");
  });

  /** And filled where it is not competing with a selected state. */
  it("is a filled disc on the account screen, which is what the phone draws", () => {
    const avatar = drawn(
      `<span class="avatar avatar--filled">D</span>`,
      ".avatar--filled",
      { sheets: [AVATAR] },
    );

    expect(avatar.background).toBe("var(--color-accent)");
    expect(avatar.color).toBe("var(--color-accent-ink)");
  });
});
