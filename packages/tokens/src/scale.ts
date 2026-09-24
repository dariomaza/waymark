/**
 * # Everything that is a measurement rather than a colour
 *
 * Pixels, in one place, because both clients think in pixels: React Native's
 * unit is a density-independent pixel and the browser's `rem` is 16 of them
 * with nothing in this app moving the root size. The CSS renderer divides by
 * 16 on the way out; nothing else converts anything.
 *
 * Writing them as numbers rather than as two syntaxes is the point. `0.875rem`
 * and `14` are the same decision spelled twice, and a decision spelled twice is
 * a decision that drifts.
 */

/**
 * The spacing steps. Four, then eights: close enough to a ratio to look
 * deliberate, coarse enough that nobody reaches for a number in between.
 */
export const SPACE = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 32,
} as const;

export type SpaceStep = keyof typeof SPACE;

export const RADIUS = {
  s: 6,
  m: 10,
  l: 16,
} as const;

export type RadiusStep = keyof typeof RADIUS;

/**
 * The type scale.
 *
 * `s` is body-adjacent and the smallest thing a sentence is ever set in; `m`
 * is the body, and it is 16 because anything smaller makes iOS Safari zoom the
 * page when an input takes focus. `l` names a part of a screen and `xl` names
 * the screen.
 */
export const TEXT = {
  s: 14,
  m: 16,
  l: 20,
  xl: 24,
} as const;

export type TextStep = keyof typeof TEXT;

/**
 * Nothing tappable is smaller than this. The app is used one-handed, standing
 * up, sometimes on a step ladder, and a thumb is about 9mm across.
 */
export const TAP_TARGET = 48;

/** The chrome: the top bar, and the row of tabs at the bottom. */
export const BAR_HEIGHT = 56;
