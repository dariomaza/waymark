import { DEFAULT_LANGUAGE, isLanguage, preferredLanguage, type Language } from "@waymark/i18n";

/**
 * # Where the browser keeps the one preference this app has
 *
 * The language list, the names and the translations themselves live in
 * `@waymark/i18n`, shared with the phone. What stays here is the only part
 * that is genuinely the browser's: `localStorage`, and what to do when there
 * is nothing in it.
 */
const KEY = "waymark.language";

/**
 * What to show somebody who has never touched the switcher.
 *
 * Now that there ARE translations, the browser is asked first. Somebody whose
 * machine is in Spanish should not have to find a control to be spoken to in
 * Spanish — the setting exists to OVERRIDE this, not to be the only way to
 * reach it.
 *
 * `navigator.languages` rather than `navigator.language`: the first is the
 * ordered list a person actually configured, and somebody with Catalan first
 * and Spanish second should get Spanish rather than English.
 */
const fromTheBrowser = (): Language => {
  try {
    return preferredLanguage(globalThis.navigator?.languages ?? []) ?? DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

/**
 * # Reads and writes never throw, and never depend on there being a store
 *
 * `localStorage` is not a variable. It throws on access in a private window,
 * with site data blocked, and inside some embedded browsers — and it is
 * absent outright under the test runner, where jsdom is configured without
 * it. A preference this small must never be the reason a screen fails to
 * render.
 *
 * So this falls back to memory exactly the way `session-store.ts` does, and
 * for the same reason: a choice that could not be written to disk must still
 * hold for as long as the app is open. Without that, somebody in a private
 * window would pick Spanish and watch it revert on the next navigation.
 */
let remembered: Language | null = null;

export const languageStore = {
  read(): Language {
    try {
      const stored: unknown = globalThis.localStorage?.getItem(KEY) ?? remembered;

      return isLanguage(stored) ? stored : fromTheBrowser();
    } catch {
      return remembered ?? fromTheBrowser();
    }
  },

  save(language: Language): void {
    remembered = language;

    try {
      globalThis.localStorage?.setItem(KEY, language);
    } catch {
      // A preference that could not be written down still applies to this visit.
    }
  },

  /** Only ever called between tests, so one person's choice is not the next one's. */
  forget(): void {
    remembered = null;

    try {
      globalThis.localStorage?.removeItem(KEY);
    } catch {
      // Nothing stored is the state we were after anyway.
    }
  },
};
