import {
  DEFAULT_THEME_CHOICE,
  isThemeChoice,
  PALETTES,
  schemeFor,
  THEME_KEY,
  type Scheme,
  type ThemeChoice,
} from "@waymark/tokens";

/**
 * # Where the browser keeps how the app should look (ADR 25)
 *
 * The same arrangement as `language.ts`, for the same reasons: `localStorage`
 * throws in a private window and is absent under the test runner, so every
 * read and write is guarded, and a choice that could not be written down still
 * holds in memory for as long as the page is open.
 *
 * `public/theme.js` reads the same key before the first paint. It cannot
 * import this file — it runs before the bundle exists — so
 * `choosing-how-it-looks.test.tsx` holds the two readers to each other.
 */
let remembered: ThemeChoice | null = null;

export const themeStore = {
  read(): ThemeChoice {
    try {
      const stored: unknown = globalThis.localStorage?.getItem(THEME_KEY) ?? remembered;

      return isThemeChoice(stored) ? stored : DEFAULT_THEME_CHOICE;
    } catch {
      return remembered ?? DEFAULT_THEME_CHOICE;
    }
  },

  save(choice: ThemeChoice): void {
    remembered = choice;

    try {
      globalThis.localStorage?.setItem(THEME_KEY, choice);
    } catch {
      // A choice that could not be written down still applies to this visit.
    }
  },

  /** Only ever called between tests, so one person's choice is not the next one's. */
  forget(): void {
    remembered = null;

    try {
      globalThis.localStorage?.removeItem(THEME_KEY);
    } catch {
      // Nothing stored is the state we were after anyway.
    }
  },
};

const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** What the device prefers, or `null` where the browser cannot say. */
export const deviceScheme = (): Scheme | null => {
  try {
    const light = globalThis.matchMedia?.(LIGHT_QUERY);

    return light === undefined ? null : light.matches ? "light" : "dark";
  } catch {
    return null;
  }
};

/** Calls back whenever the device's own scheme changes. Returns the way to stop. */
export const onDeviceSchemeChange = (callback: () => void): (() => void) => {
  try {
    const light = globalThis.matchMedia?.(LIGHT_QUERY);
    light?.addEventListener("change", callback);

    return () => light?.removeEventListener("change", callback);
  } catch {
    return () => undefined;
  }
};

/**
 * # Putting a choice on the page
 *
 * The stylesheet does the painting (see `packages/tokens/src/css.ts`): a
 * `data-theme` on the root wins over the media query in both directions, and
 * no attribute at all means "follow the device". So System REMOVES it rather
 * than writing `system`, which nothing matches.
 *
 * The one colour the stylesheet cannot reach is the browser's own bar, which
 * comes from `<meta name="theme-color">`. It follows the scheme actually
 * painted — the device's when System is chosen — and takes the page's surface
 * from the shared palette rather than a literal.
 */
export const applyTheme = (choice: ThemeChoice): void => {
  const root = document.documentElement;

  if (choice === "system") {
    delete root.dataset["theme"];
  } else {
    root.dataset["theme"] = choice;
  }

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", PALETTES[schemeFor(choice, deviceScheme())].surface);
};
