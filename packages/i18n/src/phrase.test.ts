import { describe, expect, it } from "vitest";

import { fill, formatCount, pluralFormOf } from "./phrase.js";

/**
 * # The two things a sentence needs that a string constant cannot do
 *
 * Everything else in this package is a lookup. These are the parts where a
 * translation stops being a table and starts being grammar, so they are
 * tested on their own, away from any dictionary — a bug here would otherwise
 * only ever show up as one screen reading slightly wrong.
 */
describe("putting values into a sentence", () => {
  it("replaces a named hole with what was handed in", () => {
    expect(fill("Move {name} somewhere else", { name: "Winter coats" })).toBe(
      "Move Winter coats somewhere else",
    );
  });

  it("replaces every occurrence, because a name can be said twice", () => {
    expect(fill("{name} cannot go inside {name}", { name: "Attic" })).toBe(
      "Attic cannot go inside Attic",
    );
  });

  it("leaves a sentence with no holes exactly as it was written", () => {
    expect(fill("Sign out", {})).toBe("Sign out");
  });

  /**
   * A name typed by a person is not a template. If somebody calls a box
   * `{count}` the app must print those eight characters, not reach for a
   * value — substituting into what was just substituted is how a translation
   * layer becomes an injection.
   */
  it("does not substitute into a value it has already put in", () => {
    expect(fill("{name} is full", { name: "{count} boxes" })).toBe("{count} boxes is full");
  });

  /**
   * The types make this unreachable from app code; it stays defined because
   * a missing value must never blank out the rest of the sentence around it.
   */
  it("leaves a hole nobody filled visible rather than printing nothing", () => {
    expect(fill("{name} is full", {})).toBe("{name} is full");
  });
});

/**
 * # Why the rule is written out rather than asked of `Intl`
 *
 * `Intl.PluralRules` is the right answer for a product that will grow a
 * long tail of languages. This one has two, both of which pick `one` for
 * exactly 1 and `other` for everything else, and Hermes on Android ships a
 * cut-down ICU whose plural data has historically depended on how the app was
 * built. A rule this small, written down and tested, cannot be missing at
 * runtime on somebody's phone — and the day a third language arrives, this is
 * the one function that has to learn about it.
 */
describe("choosing a plural form", () => {
  it("says one thing in English for exactly one", () => {
    expect(pluralFormOf("en", 1)).toBe("one");
  });

  it("says one thing in Spanish for exactly one", () => {
    expect(pluralFormOf("es", 1)).toBe("one");
  });

  it.each([0, 2, 3, 12, 100])("says many for %i", (count) => {
    expect(pluralFormOf("en", count)).toBe("other");
    expect(pluralFormOf("es", count)).toBe("other");
  });

  /**
   * Neither language has a form for 1.5 things, and "1.5 item" would be
   * wrong in both. Nothing in this product counts in halves; this only says
   * what happens if something ever does.
   */
  it("treats a fraction as many", () => {
    expect(pluralFormOf("en", 1.5)).toBe("other");
    expect(pluralFormOf("es", 1.5)).toBe("other");
  });

  it("treats a negative count as many", () => {
    expect(pluralFormOf("en", -1)).toBe("other");
  });
});

/**
 * Spanish groups thousands with a full stop where English uses a comma, and a
 * count printed the other language's way is the kind of detail that makes a
 * translation feel machine-made.
 *
 * It also does not group as eagerly. Spanish sets a minimum of two grouping
 * digits, so four figures are written straight through — `1234` and then
 * `12.345` — where English breaks at a thousand. Hand-rolling a separator
 * would have got this wrong in a way nobody would have caught, which is the
 * argument for asking the platform rather than writing out the rule the way
 * the plural categories are.
 */
describe("printing a count", () => {
  it("groups with the language's own separator", () => {
    expect(formatCount("en", 12345)).toBe("12,345");
    expect(formatCount("es", 12345)).toBe("12.345");
  });

  it("writes four figures straight through in Spanish, and breaks them in English", () => {
    expect(formatCount("en", 1234)).toBe("1,234");
    expect(formatCount("es", 1234)).toBe("1234");
  });

  it("leaves a small count alone", () => {
    expect(formatCount("en", 7)).toBe("7");
    expect(formatCount("es", 7)).toBe("7");
  });
});
