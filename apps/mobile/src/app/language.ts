import type { SecureStorage } from "../auth/secure-storage.js";

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
 * translations exist this should ask the phone's own locale first and fall
 * back here.
 */
export const DEFAULT_LANGUAGE: Language = "en";

/** What each language calls ITSELF. A language list in one language is a list only its speakers can read. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
};

export const LANGUAGE_KEY = "ariadna.language";

const isLanguage = (value: unknown): value is Language =>
  typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

export interface LanguageStore {
  read(): Promise<Language>;
  save(language: Language): Promise<void>;
}

/**
 * # Why a preference lives in the keystore, and why reading it is a promise
 *
 * The web client has `localStorage`, which is synchronous and unencrypted.
 * This phone has neither: the one key-value store the app already carries is
 * `expo-secure-store` behind the `SecureStorage` port, and adding
 * `AsyncStorage` — a native module, a build, a lockfile — to remember two
 * letters would cost more than it saves. A language code is not a secret;
 * encrypting it costs nothing and keeps the app down to one store.
 *
 * Being asynchronous is the visible consequence: the switcher opens on
 * English and corrects itself when the read lands, rather than blocking the
 * bar on the keystore.
 *
 * Reads and writes never throw. The keystore refuses on a device with no
 * screen lock, and a preference this small must never be the reason a screen
 * fails to draw — an unreadable store simply means "no choice made yet".
 */
export const createLanguageStore = (storage: SecureStorage): LanguageStore => ({
  async read() {
    try {
      const stored = await storage.read(LANGUAGE_KEY);

      return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
    } catch {
      return DEFAULT_LANGUAGE;
    }
  },

  async save(language) {
    try {
      await storage.write(LANGUAGE_KEY, language);
    } catch {
      // A preference that could not be remembered still applies to this run.
    }
  },
});
