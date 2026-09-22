/**
 * # Which languages Waymark speaks
 *
 * This used to be written twice — once in the web client and once on the
 * phone — because the switcher landed before the translations did and each
 * client only needed to remember two letters. A language list that exists in
 * two places is a list that will disagree the day a third language is added,
 * so now there is one, and each client keeps only the part that is genuinely
 * its own: WHERE the choice is stored.
 */
export const LANGUAGES = ["en", "es"] as const;

export type Language = (typeof LANGUAGES)[number];

/**
 * English, because it is the language the product was written in and the one
 * every string still has. A person who has never touched the switcher, and
 * whose browser or phone says nothing this app understands, gets it.
 */
export const DEFAULT_LANGUAGE: Language = "en";

/** What each language calls ITSELF. A language list in one language is a list only its speakers can read. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
};

/**
 * Whether a value read back out of a store is a language this app has.
 *
 * Storage is not a type system: the value may have been written by a version
 * of this app that spoke three languages, or by something else entirely.
 */
export const isLanguage = (value: unknown): value is Language =>
  typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

/**
 * The best of the languages a device asks for, or `null` if it asks for none
 * this app has.
 *
 * Both clients can ask their platform what a person reads — the browser has
 * `navigator.languages`, the phone has its own locale list — and both get back
 * tags like `es-ES` or `en-GB`. Region is not a language here: Waymark's
 * Spanish is neutral and professional rather than peninsular, so `es-419` and
 * `es-ES` are the same answer. Order is honoured, because the platform already
 * sorted it by preference.
 */
export const preferredLanguage = (requested: readonly string[]): Language | null => {
  for (const tag of requested) {
    const base = tag.toLowerCase().split("-")[0];

    if (isLanguage(base)) {
      return base;
    }
  }

  return null;
};
