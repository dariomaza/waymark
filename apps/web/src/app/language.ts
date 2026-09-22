/**
 * Which language the interface is asked for.
 *
 * The choice is stored and honoured from the day the switcher appears, before
 * a single string is translated. That order is deliberate: a control that
 * looks like a setting and quietly ignores you is worse than no control, and
 * wiring the storage first means the day translations land there is nothing
 * to migrate — the preference is already there, already chosen.
 */
export const LANGUAGES = ["en", "es"] as const;

export type Language = (typeof LANGUAGES)[number];

/**
 * English, because every string in the product is English today. The moment
 * translations exist this should ask the browser first and fall back here.
 */
export const DEFAULT_LANGUAGE: Language = "en";

/** What each language calls ITSELF. A language list in one language is a list only its speakers can read. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
};

const KEY = "ariadna.language";

const isLanguage = (value: unknown): value is Language =>
  typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

/**
 * Reads and writes never throw.
 *
 * `localStorage` is not a variable: it throws on access in a private window,
 * with site data blocked, and inside some embedded browsers. A preference
 * this small must never be the reason a screen fails to render, so an
 * unreadable store simply means "no choice made yet".
 */
export const languageStore = {
  read(): Language {
    try {
      const stored: unknown = window.localStorage.getItem(KEY);
      return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
    } catch {
      return DEFAULT_LANGUAGE;
    }
  },

  save(language: Language): void {
    try {
      window.localStorage.setItem(KEY, language);
    } catch {
      // A preference that could not be remembered still applies to this visit.
    }
  },
};
