import type { WebColorName } from "./palette.js";

/**
 * # The contrast of two colours, as WCAG 2 defines it
 *
 * Each channel is taken off the sRGB transfer curve, weighted for how much of
 * perceived brightness it carries, and the lighter of the two results is
 * compared with the darker with 0.05 added to both — the constant that stops
 * black on black being an infinite ratio and models the light a real screen
 * reflects.
 *
 * It is here, and used by a test, so that the numbers this package publishes
 * are produced by the same arithmetic that produced them the first time. The
 * eight ratios the two old palette files carried in comments reproduce to the
 * last digit, which is the evidence that this IS that arithmetic.
 */
const channel = (value: number): number =>
  value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const luminance = (hex: string): number => {
  const digits = hex.replace("#", "");
  const [red, green, blue] = [0, 2, 4].map((at) =>
    channel(Number.parseInt(digits.slice(at, at + 2), 16) / 255),
  );

  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
};

export const contrastRatio = (of: string, on: string): number => {
  const [lighter, darker] = [luminance(of), luminance(on)].sort((a, b) => b - a);

  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
};

/**
 * What a ratio has to clear to do a given job, from WCAG 2.1.
 *
 * `0` is not "anything goes": it marks a pair that is MEASURED and deliberately
 * fails, which is a thing worth recording rather than leaving out. The lime
 * fill on the light surface is the only one, and the token that rescues it is
 * the whole reason `accentBorder` exists.
 */
export const AA_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const AA_BOUNDARY = 3;

export interface Measured {
  readonly scheme: "dark" | "light";
  /** The foreground, by token name — so renaming a token breaks this too. */
  readonly of: WebColorName;
  readonly on: WebColorName;
  /** As measured, to two places. Recomputed and checked on every test run. */
  readonly ratio: number;
  /** What this pair's job requires. `0` where the pair is recorded as failing. */
  readonly needs: number;
}

/**
 * # Every pair that had to be measured before a colour was chosen
 *
 * These are the numbers the two palette files carried as prose. They are the
 * reason the greys are the greys and the reason `accentText` exists, and they
 * were the first thing at risk from a palette written down twice: a comment
 * is exactly as true as the last person to edit the value beside it.
 *
 * Kept as DATA so a test can recompute them. The `of`/`on` fields are token
 * NAMES rather than hex, so this table follows the palette when the palette
 * moves instead of quietly describing colours that are no longer there.
 */
export const MEASURED: readonly Measured[] = [
  { scheme: "dark", of: "ink", on: "surface", ratio: 17.3, needs: AA_TEXT },
  { scheme: "dark", of: "ink", on: "surfaceRaised", ratio: 15.86, needs: AA_TEXT },
  { scheme: "dark", of: "inkMuted", on: "surface", ratio: 7.98, needs: AA_TEXT },
  { scheme: "dark", of: "inkMuted", on: "surfaceRaised", ratio: 7.31, needs: AA_TEXT },
  { scheme: "dark", of: "accent", on: "surface", ratio: 14.51, needs: AA_BOUNDARY },
  { scheme: "dark", of: "accentInk", on: "accent", ratio: 13.85, needs: AA_TEXT },

  { scheme: "light", of: "ink", on: "surface", ratio: 17.67, needs: AA_TEXT },
  { scheme: "light", of: "ink", on: "surfaceRaised", ratio: 18.44, needs: AA_TEXT },
  { scheme: "light", of: "inkMuted", on: "surface", ratio: 6.15, needs: AA_TEXT },
  { scheme: "light", of: "inkMuted", on: "surfaceRaised", ratio: 6.42, needs: AA_TEXT },
  { scheme: "light", of: "accentText", on: "surface", ratio: 7.32, needs: AA_TEXT },
  { scheme: "light", of: "accentInk", on: "accent", ratio: 13.85, needs: AA_TEXT },

  /**
   * The failure, recorded on purpose. A lime fill on near-white has no
   * silhouette, and `accentBorder` is what gives it one — which is why the
   * browser has that token and the phone does not.
   */
  { scheme: "light", of: "accent", on: "surface", ratio: 1.26, needs: 0 },
  { scheme: "light", of: "accentBorder", on: "surface", ratio: 3.24, needs: AA_BOUNDARY },
];
