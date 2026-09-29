import { DARK, LIGHT, type Palette } from "./palette.js";

/**
 * # Light, dark, or whatever the device says (ADR 25)
 *
 * Both clients offer the same three answers, in the same order, and resolve
 * them the same way. So the answers and the resolving live here, beside the
 * palettes they choose between; what each client STORES, and how it asks its
 * platform what the device prefers, stay in the client.
 */
export const THEME_CHOICES = ["system", "light", "dark"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** A scheme is what is actually painted; a choice may defer to the device. */
export type Scheme = Exclude<ThemeChoice, "system">;

/**
 * Nobody has to find a setting to get the scheme their device is already in.
 * The setting exists to OVERRIDE it, the way the language switcher does.
 */
export const DEFAULT_THEME_CHOICE: ThemeChoice = "system";

/** The key both clients store the choice under, each in its own store. */
export const THEME_KEY = "waymark.theme";

export const isThemeChoice = (value: unknown): value is ThemeChoice =>
  typeof value === "string" && (THEME_CHOICES as readonly string[]).includes(value);

/**
 * What gets painted.
 *
 * A device with no opinion — React Native's `useColorScheme()` can answer
 * `null` — gets the dark: this is opened in a storage room at night as often
 * as anywhere else, and dark is the scheme the product was drawn in first.
 */
export const schemeFor = (choice: ThemeChoice, device: Scheme | null | undefined): Scheme =>
  choice === "system" ? (device === "light" ? "light" : "dark") : choice;

/** Each scheme's palette — the shared objects themselves, never a copy. */
export const PALETTES: Readonly<Record<Scheme, Palette>> = { dark: DARK, light: LIGHT };
