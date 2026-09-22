import type { Language } from "./language.js";

/**
 * The plural forms this package knows about.
 *
 * English and Spanish share the same two cardinal categories, so the type is
 * deliberately not `Intl.LDMLPluralRule`: a dictionary should not be able to
 * carry a `few` that no language here will ever select, sitting untranslated
 * and unnoticed because nothing reads it.
 */
export type PluralForm = "one" | "other";

/**
 * # Why the rule is written out rather than asked of `Intl`
 *
 * `Intl.PluralRules` is the right answer for a product with a long tail of
 * languages. This one has two, both of which pick `one` for exactly 1 and
 * `other` for everything else — and Hermes on Android ships a cut-down ICU
 * whose plural data has historically depended on how the app was built. A rule
 * this small, written down here, cannot go missing at runtime on somebody's
 * phone.
 *
 * It takes the language rather than ignoring it, because the day a third one
 * arrives this is the single function that has to learn about it, and a
 * signature that never mentioned the language would have to be found first.
 */
export const pluralFormOf = (language: Language, count: number): PluralForm => {
  switch (language) {
    case "en":
    case "es":
      // Not `count === 1`: 1.0 is one thing and 1.5 is not, and neither
      // language has a form for half of something.
      return count === 1 ? "one" : "other";
  }
};

/**
 * A count, printed the way the language prints numbers.
 *
 * Spanish groups thousands with a full stop where English uses a comma. The
 * counts in this product are things in a garage and rarely reach four digits,
 * but "1,234 cosas" is exactly the kind of detail that makes a translation
 * read as machine-made.
 *
 * `Intl.NumberFormat` is a much smaller ask than `Intl.PluralRules` — number
 * grouping is in every JavaScript runtime this app runs on, including Hermes
 * — but it is still the operating system, and a preference this small must
 * never be the reason a screen fails to draw. If it is not there, the digits
 * are.
 */
export const formatCount = (language: Language, count: number): string => {
  try {
    return new Intl.NumberFormat(language).format(count);
  } catch {
    return String(count);
  }
};

/** The values a sentence can have put into it. Counts arrive already printed. */
export type PhraseValues = Readonly<Record<string, string>>;

const HOLE = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

/**
 * Puts values into the named holes in a sentence.
 *
 * Done in ONE pass, deliberately. Names are typed by people, and a box called
 * `{count}` must print those eight characters rather than have them read as a
 * hole in the sentence that was just built — substituting into what was
 * already substituted is how a template becomes an injection. A single
 * `replace` over the original template cannot look at its own output.
 *
 * A hole nobody filled is left visible. The types make that unreachable from
 * app code (see `dictionary.ts`), and if it ever happens a person should see
 * which word went missing rather than a sentence that quietly lost its
 * subject.
 */
export const fill = (template: string, values: PhraseValues): string =>
  template.replace(HOLE, (hole, name: string) => values[name] ?? hole);
