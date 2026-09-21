/**
 * The whole visual vocabulary, in one place, and the same one the web client
 * uses.
 *
 * Dark, always: this is opened in a storage room at night as often as
 * anywhere else, and a white screen at arm's length in the dark is the
 * difference between reading a label and turning the phone away. The web app
 * follows the system; a phone held over a box does not get that choice,
 * because the camera screen is black either way.
 */
export const colors = {
  surface: "#11150f",
  surfaceRaised: "#1b211a",
  surfaceSunken: "#0b0e0a",
  ink: "#f2f5ee",
  inkMuted: "#a8b3a0",
  line: "#2f382c",
  accent: "#c8f04a",
  accentInk: "#11150f",
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
