/**
 * # The wait, as the pin finding its place
 *
 * The owner asked for the loading animation to be the logo — "para eso lo
 * hemos creado". The w stays put; the pin drops onto it, goes a little past
 * and settles, rests there for a beat — the "found it" moment — and lifts to
 * do it again.
 *
 * Written once, as data, so both clients run the same clock through the same
 * shape: the browser renders these steps into `@keyframes pin-drop` in the
 * generated stylesheet (`css.ts`), and the phone builds an `Animated`
 * sequence from them. `y` is in the symbol's own units (see `SYMBOL` in
 * `mark.ts`), downwards positive, 0 being where the approved mark draws the
 * pin; each client scales it to the size it draws.
 *
 * `ease` is a cubic Bézier for the stretch FROM that step to the next, the
 * way CSS reads `animation-timing-function` inside a keyframe and the way
 * `Easing.bezier` takes it. Nothing is linear: a falling thing speeds up and a
 * landing thing slows down.
 */
export interface MotionStep {
  /** Where in the loop, from 0 to 1. */
  readonly at: number;
  /** The pin's offset from its resting place, in the symbol's units. */
  readonly y: number;
  readonly ease: readonly [number, number, number, number];
}

/** Speeds up as it goes: a drop. */
const FALLING = [0.55, 0, 1, 0.45] as const;
/** Slows into place: a landing, and the settle after it. */
const LANDING = [0.33, 1, 0.68, 1] as const;
/** Gently away and gently back: the lift, and the rest. */
const LIFTING = [0.65, 0, 0.35, 1] as const;

/** How far above its place the pin starts: about a quarter of the symbol. */
const LIFTED = -260;

export const PIN_DROP: {
  readonly durationMs: number;
  readonly steps: readonly MotionStep[];
} = {
  durationMs: 1400,
  steps: [
    { at: 0, y: LIFTED, ease: FALLING },
    /** Just past its place: the tip stops short of the w's arm, 28.68 below it. */
    { at: 0.26, y: 18, ease: LANDING },
    { at: 0.38, y: 0, ease: LIFTING },
    /** Found it. */
    { at: 0.7, y: 0, ease: LIFTING },
    { at: 1, y: LIFTED, ease: LIFTING },
  ],
};

/**
 * How tall the wait draws the symbol, in pixels on the browser and points on
 * the phone. Above the 24 at which the brand switches to the solid-pin cut, so
 * the full pin — ring and core — is the one that drops. The lift carries the
 * pin about seven pixels above the symbol's box, into the row's own padding.
 */
export const WAIT_MARK_HEIGHT = 28;
