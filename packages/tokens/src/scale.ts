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
 * # The type scale
 *
 * `s` is the smallest thing a SENTENCE is ever set in; `m` is the body, and it
 * is 16 because anything smaller makes iOS Safari zoom the page when an input
 * takes focus. `l` names a part of a screen and `xl` names the screen.
 *
 * ## `xs` is a step that was added on purpose, for one role
 *
 * The scale was 14/16/20/24, and the browser drew four things that were on no
 * scale at all: the card's initials at 1.6rem, its secondary line at 0.72rem,
 * its quantity badge at 0.66rem, and the word under a tab-bar icon at 0.7rem.
 * Three of those were a card being written without looking at the scale, and
 * they are now `xl`, `s` and `s` (ADR 22).
 *
 * The fourth is different, and it is the reason this step exists. The word
 * under a tab-bar icon is the one place in this product where a word is a
 * CAPTION ON A SYMBOL rather than a line of text: the icon carries the
 * meaning, the word disambiguates it, and it has to stay on one line in both
 * languages across four tabs on a 360px screen. Neither client had made that
 * decision — the browser had an unexplained 0.7rem and the phone was
 * inheriting whatever React Navigation's default happened to be, which is not
 * this product's number to leave to somebody else.
 *
 * 12, because it extends the scale rather than sitting beside it: 14 to 16 is
 * a step of two, so two below 14 is where the bottom of this scale already
 * was. It is for that role. A SENTENCE still starts at `s`.
 */
export const TEXT = {
  xs: 12,
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

/**
 * # How heavy the word under a tab-bar icon is
 *
 * The size of that word is `TEXT.xs`, and ADR 22 explains at length why the
 * scale grew a step for it rather than leaving it to a library. The WEIGHT was
 * left behind in that same change, and it is the same defect: the browser
 * carried an unexplained 650 and the phone inherited whatever React
 * Navigation's default happened to be. The owner put both bars on one phone and
 * the browser's was plainly the bolder of the two.
 *
 * 600, because that is what every word inside a control in this product is set
 * in — a `Button`'s label on both clients — and a tab is a control. A caption
 * on a symbol has no business being heavier than the button beside it.
 */
export const TAB_LABEL_WEIGHT = 600;
