import { describe, expect, it } from "vitest";

import { LANGUAGES } from "./language.js";
import { translator } from "./translate.js";
import { EN } from "./en.js";
import { ES } from "./es.js";

describe("saying something in the language that was asked for", () => {
  it("answers in English", () => {
    expect(translator("en")("nav.places")).toBe("Places");
  });

  it("answers in Spanish", () => {
    expect(translator("es")("nav.places")).toBe("Lugares");
  });

  it("puts a value into the sentence", () => {
    expect(translator("en")("shell.signedInAs", { username: "dario" })).toBe(
      "Signed in as dario",
    );
    expect(translator("es")("shell.signedInAs", { username: "dario" })).toBe(
      "Sesión iniciada como dario",
    );
  });

  /**
   * The point of the whole exercise. "1 item" and "2 items" are not one
   * sentence with a number glued to the front, and Spanish agreement is not
   * English's — the noun changes, and so does everything that agrees with it.
   */
  describe("counting", () => {
    it("counts one thing", () => {
      expect(translator("en")("units.itemCount", { count: 1 })).toBe("1 item");
      expect(translator("es")("units.itemCount", { count: 1 })).toBe("1 cosa");
    });

    it("counts several things", () => {
      expect(translator("en")("units.itemCount", { count: 12 })).toBe("12 items");
      expect(translator("es")("units.itemCount", { count: 12 })).toBe("12 cosas");
    });

    it("counts none of something", () => {
      expect(translator("en")("units.itemCount", { count: 0 })).toBe("0 items");
      expect(translator("es")("units.itemCount", { count: 0 })).toBe("0 cosas");
    });

    /** Spanish nouns have a gender, and `unidad` is not `cosa`. */
    it("agrees with the noun it is counting, not with the English one", () => {
      expect(translator("es")("units.unitCount", { count: 1 })).toBe("1 unidad");
      expect(translator("es")("units.unitCount", { count: 2 })).toBe("2 unidades");
    });

    it("prints the count the way the language prints numbers", () => {
      expect(translator("en")("units.itemCount", { count: 12345 })).toBe("12,345 items");
      expect(translator("es")("units.itemCount", { count: 12345 })).toBe("12.345 cosas");
    });
  });

  /**
   * A refusal decided somewhere that has no business knowing which language
   * is on screen — see `refusals.ts`. It travels as the key and the numbers,
   * and becomes a sentence here.
   */
  it("says a message that was decided elsewhere", () => {
    const t = translator("es");

    expect(t({ key: "units.itemCount", values: { count: 3 } })).toBe("3 cosas");
  });

  it("passes a nothing through, so a caller can keep asking without checking first", () => {
    expect(translator("en")(null)).toBeNull();
  });
});

/**
 * # The build is what keeps the two dictionaries in step
 *
 * `Dictionary` is derived from the English one, so a key Spanish is missing —
 * or one it has that English does not — is a type error rather than a key
 * name rendered in somebody's garage. That is a compile-time guarantee and
 * cannot be asserted here.
 *
 * What the types do NOT catch is a Spanish sentence that reaches for a value
 * nobody will hand it, because the values are typed from the English phrase
 * alone. That failure is silent and looks like a typo in the copy, so it is
 * checked here instead.
 */
describe("the two dictionaries as a pair", () => {
  const holesIn = (phrase: string): readonly string[] =>
    [...phrase.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map((found) => found[1] ?? "");

  const everyPhrase = (phrase: unknown): readonly string[] =>
    typeof phrase === "string" ? [phrase] : Object.values(phrase as Record<string, string>);

  const holesOf = (phrase: unknown): ReadonlySet<string> =>
    new Set(everyPhrase(phrase).flatMap(holesIn));

  const keys = Object.keys(EN) as (keyof typeof EN)[];

  it.each(keys)("says %s in Spanish with the values English asked for", (key) => {
    const english = holesOf(EN[key]);

    for (const hole of holesOf(ES[key])) {
      expect(english, `{${hole}} is in the Spanish of "${key}" but not the English`).toContain(
        hole,
      );
    }
  });

  it.each(keys)("leaves nothing untranslated at %s", (key) => {
    for (const phrase of everyPhrase(ES[key])) {
      expect(phrase.trim()).not.toBe("");
    }
  });

  /**
   * A phrase with plural forms in one language and not the other is a
   * sentence that will read wrong for every count but one. The types already
   * refuse it; this says so out loud, because the type that does it is
   * subtle enough to be "simplified" away.
   */
  it.each(keys)("counts in both languages or in neither, at %s", (key) => {
    expect(typeof ES[key]).toBe(typeof EN[key]);
  });

  it("has a name for every language in every language's own words", () => {
    for (const language of LANGUAGES) {
      expect(translator(language)("language.label")).not.toBe("");
    }
  });
});
