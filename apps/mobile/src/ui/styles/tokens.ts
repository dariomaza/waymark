/**
 * The whole visual vocabulary, in one place, and the same one the web client
 * uses — `apps/web/src/ui/styles/tokens.css` carries these exact values, with
 * a light scheme beside them.
 *
 * Dark, always: this is opened in a storage room at night as often as
 * anywhere else, and a white screen at arm's length in the dark is the
 * difference between reading a label and turning the phone away. The web app
 * follows the system; a phone held over a box does not get that choice,
 * because the camera screen is black either way.
 *
 * # Why the surfaces are neutral and only the accent has colour
 *
 * They were not. Every token used to sit between hue 74 and hue 111 — the
 * surfaces, the lines, the muted text and the accent were all olive — and an
 * accent only means "look here" when it is the one saturated thing on screen.
 * Against a world made of itself it means nothing.
 *
 * # Why the accent is three tokens and not one
 *
 * An accent does two jobs with opposite requirements: it fills a button, and
 * it is a foreground on the page. The web client needs a fourth token, a
 * border, because there the lime fill sits on near-white and its silhouette
 * fails a component boundary. Here it does not — the fill is at 14.51 against
 * this surface — so `accentBorder` is absent rather than transparent, to keep
 * this file honest about what the platform actually needs.
 *
 * Contrast, measured: ink/surface 17.30, ink/raised 15.86, muted/surface
 * 7.98, muted/raised 7.31, accent/surface 14.51, accentInk/accent 13.85.
 */
export const colors = {
  surface: "#101011",
  surfaceRaised: "#191a1b",
  surfaceSunken: "#0a0a0b",
  ink: "#f4f4f5",
  inkMuted: "#a6a8ab",
  line: "#2e3032",

  /** The fill, and the ink that goes on it. */
  accent: "#c8f04a",
  accentInk: "#14170a",
  /** The accent as a foreground: a link, the active tab, an outline button. */
  accentText: "#c8f04a",

  danger: "#ff8a7a",
  dangerInk: "#2a0d08",
  warning: "#ffc34d",
} as const;

export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 32,
} as const;

export const radius = { s: 6, m: 10, l: 16 } as const;

export const text = { s: 14, m: 16, l: 20, xl: 24 } as const;

/**
 * Nothing tappable is smaller than this. The app is used one-handed, standing
 * up, sometimes on a step ladder.
 */
export const TAP_TARGET = 48;
