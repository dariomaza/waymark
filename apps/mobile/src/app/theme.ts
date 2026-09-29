import {
  DEFAULT_THEME_CHOICE,
  isThemeChoice,
  THEME_KEY,
  type ThemeChoice,
} from "@waymark/tokens";

import type { SecureStorage } from "../auth/secure-storage.js";

/**
 * # Where the phone keeps how the app should look (ADR 25)
 *
 * In the keystore, beside the language, for the reasons `language.ts` gives:
 * it is the one store this app already carries, and a second native module to
 * remember one word would cost more than it saves. Reads and writes never
 * throw — a keystore that refuses (no screen lock) means "no choice made yet",
 * which is System.
 */
export interface ThemeStore {
  read(): Promise<ThemeChoice>;
  save(choice: ThemeChoice): Promise<void>;
}

export const createThemeStore = (storage: SecureStorage): ThemeStore => ({
  async read() {
    try {
      const stored = await storage.read(THEME_KEY);

      return isThemeChoice(stored) ? stored : DEFAULT_THEME_CHOICE;
    } catch {
      return DEFAULT_THEME_CHOICE;
    }
  },

  async save(choice) {
    try {
      await storage.write(THEME_KEY, choice);
    } catch {
      // A choice that could not be remembered still applies to this run.
    }
  },
});
