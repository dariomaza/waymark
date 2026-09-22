import { DEFAULT_LANGUAGE, isLanguage, preferredLanguage, type Language } from "@waymark/i18n";

import type { SecureStorage } from "../auth/secure-storage.js";

/**
 * # Where the phone keeps the one preference this app has
 *
 * The language list, the names and the translations themselves live in
 * `@waymark/i18n`, shared with the web client. What stays here is the only
 * part that is genuinely the phone's: the keystore, and the phone's own idea
 * of what language its owner reads.
 */
export const LANGUAGE_KEY = "ariadna.language";

export interface LanguageStore {
  read(): Promise<Language>;
  save(language: Language): Promise<void>;
}

/**
 * What to show somebody who has never touched the switcher.
 *
 * A phone that is set up in Spanish should open this app in Spanish, without
 * anybody having to find a control first. The switcher exists to OVERRIDE
 * this, not to be the only way to reach it.
 *
 * `Intl` rather than `expo-localization`. The device locale is one string and
 * this needs the first two letters of it; pulling in a native module, a
 * rebuild and a lockfile entry to read something the JavaScript runtime
 * already knows would be paying a build cost for a substring. Hermes resolves
 * the locale from the OS, and if some runtime ever does not, the fallback is
 * the language the app was written in.
 */
const fromThePhone = (): Language => {
  try {
    return (
      preferredLanguage([Intl.DateTimeFormat().resolvedOptions().locale]) ?? DEFAULT_LANGUAGE
    );
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

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
 * Being asynchronous is the visible consequence, and it is now a consequence
 * that matters. When the switcher translated nothing, a late read meant a
 * control settling into place; now it would mean the whole interface
 * redrawing in a different language a frame after somebody saw it. So the
 * provider WAITS for this rather than rendering English and correcting
 * itself — see `language-context.tsx`.
 *
 * Reads and writes never throw. The keystore refuses on a device with no
 * screen lock, and a preference this small must never be the reason a screen
 * fails to draw — an unreadable store simply means "no choice made yet".
 */
export const createLanguageStore = (storage: SecureStorage): LanguageStore => ({
  async read() {
    try {
      const stored = await storage.read(LANGUAGE_KEY);

      return isLanguage(stored) ? stored : fromThePhone();
    } catch {
      return fromThePhone();
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
