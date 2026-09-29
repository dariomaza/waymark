/**
 * # Every colour this product has, written once
 *
 * There used to be two of these. `apps/web/src/ui/styles/tokens.css` and
 * `apps/mobile/src/ui/styles/tokens.ts` held the same thirteen hex values,
 * the same six spacing steps and the same four type sizes, in two syntaxes,
 * and they agreed by vigilance. That is not a mechanism. It is a habit, and
 * the habit is what eventually let the two clients read as two products on
 * one phone — see ADR 22.
 *
 * ## Why the surfaces are neutral and only the accent has colour
 *
 * They were not. Every token used to sit between hue 74 and hue 111 — the
 * surfaces, the lines, the muted text and the accent were all olive — and an
 * accent only means "look here" when it is the one saturated thing on screen.
 * Against a world made of itself it means nothing. So the greys are grey now,
 * and the lime is the only colour in the file.
 *
 * ## Why the accent is several tokens and not one
 *
 * An accent does two jobs with opposite requirements: it fills a button, and
 * it is a foreground on the page. One value cannot do both across two colour
 * schemes, and trying is what made the old palette look like two different
 * products — the accent was 62% lightness in the dark and 25% in the light.
 *
 * Split by job, the FILL can be the same lime in both schemes, which is where
 * the brand is actually perceived: the button is the largest accent surface on
 * any screen. Only `accentText` differs, and nobody reads a thin foreground as
 * "a different colour".
 *
 * The contrast ratios that back all of this are in `contrast.ts`, where they
 * are recomputed from these values rather than written beside them.
 */

/**
 * Dark, the scheme this product was drawn in first, and the one a device with
 * no opinion of its own is given.
 *
 * This is opened in a storage room at night as often as anywhere else, and a
 * white screen at arm's length in the dark is the difference between reading
 * a label and turning the phone away.
 *
 * It is `as const` for the same reason `EN` is in `@waymark/i18n`: the type
 * below is DERIVED from it, so this object is the thing that decides what a
 * palette is. Adding a token here is what makes every scheme owe one.
 */
export const DARK = {
  surface: "#101011",
  surfaceRaised: "#191a1b",
  surfaceSunken: "#0a0a0b",
  ink: "#f4f4f5",
  inkMuted: "#a6a8ab",
  line: "#2e3032",

  /** The fill, and the ink that goes on it. Identical in both schemes. */
  accent: "#c8f04a",
  accentInk: "#14170a",
  /** The accent as a foreground: a link, the active tab, an outline button. */
  accentText: "#c8f04a",
  /**
   * The lime fill's EDGE. None is needed here: the lime sits at 14.51 against
   * this surface, so its silhouette is unmistakable. See the light scheme,
   * where it is not.
   */
  accentBorder: "transparent",
  /**
   * The mark's own colour (ADR 24): lime on the ink. It is its own token
   * because in the light scheme it is neither the accent nor `accentText`.
   */
  mark: "#c8f04a",

  danger: "#ff8a7a",
  dangerInk: "#2a0d08",
  warning: "#ffc34d",
} as const;

/** Every colour name in the vocabulary every client shares. */
export type ColorName = keyof typeof DARK;

/**
 * # What a scheme must be, derived from the dark one
 *
 * The whole drift story, in three lines, and deliberately the same three that
 * keep `@waymark/i18n` honest. `Palette` has exactly the keys `DARK` has, so:
 *
 * - a colour a scheme has not given a value is a missing property — a build
 *   error;
 * - a colour a scheme invents that no other scheme has is an excess property
 *   — a build error;
 * - a scheme that is short one token cannot be assigned to this type at all.
 *
 * The literal hex strings are widened back to `string` on the way through,
 * because the light scheme obviously must not be forced to be `#101011`.
 */
export type Palette = { readonly [K in ColorName]: string };

/**
 * Light, the SECOND scheme — and since ADR 25, one both clients have.
 *
 * The phone used to be dark only, on the argument that a phone held over a
 * box gets no choice because the camera screen is black either way. That
 * argued about ONE screen; the owner asked for a light scheme and a switch on
 * both clients, and every other screen of the app is read, not aimed. So both
 * clients follow the device by default and let a person override it (ADR 25).
 *
 * Nothing here may be a colour the dark scheme does not also name.
 */
export const LIGHT: Palette = {
  surface: "#fafafa",
  surfaceRaised: "#ffffff",
  surfaceSunken: "#f0f0f2",
  ink: "#131415",
  inkMuted: "#5c5f63",
  line: "#dcdde0",

  /* The same lime, deliberately, and the same ink on it: 13.85 either way. */
  accent: "#c8f04a",
  accentInk: "#14170a",
  /** A lime foreground on near-white is unreadable, so this one must move. */
  accentText: "#3f5c0c",
  /**
   * Here the edge is load bearing: the fill has 1.26 against the page and a
   * component boundary needs 3. `the-measurements-are-real.test.ts` is where
   * that stops being a claim.
   */
  accentBorder: "#7a9620",
  /**
   * Never lime on white, so the mark is the ink here — not the dark green
   * `accentText` becomes, which is the colour of a link (ADR 24).
   */
  mark: "#131415",

  danger: "#a92c14",
  dangerInk: "#ffffff",
  warning: "#8a5a00",
};

/**
 * # The token only the browser needs, and the honest reason for it
 *
 * A shared palette is worth nothing if it makes the two clients pretend to be
 * the same platform. `focus` is ABSENT from the phone rather than transparent
 * or unused there, which keeps the mobile side honest about what the platform
 * actually needs.
 *
 * It is the keyboard's ring. React Native has no `:focus-visible` and no
 * keyboard focus model to draw one for; a phone's affordance is the press
 * state, which every control already carries. A token for a ring nothing can
 * draw would be a colour with no job.
 *
 * `accentBorder` used to be here too, on the argument that only the browser
 * had a light scheme for the lime fill to need rescuing in. The phone has one
 * now (ADR 25), so the edge moved into the shared palette.
 */
export const DARK_WEB_ONLY = {
  focus: "#8fd0ff",
} as const;

export type WebOnlyName = keyof typeof DARK_WEB_ONLY;

/** Derived from the dark web-only set, for exactly the reason `Palette` is. */
export type WebOnlyPalette = { readonly [K in WebOnlyName]: string };

export const LIGHT_WEB_ONLY: WebOnlyPalette = {
  focus: "#12558a",
};

/** Every colour the browser draws with: the shared vocabulary plus its own. */
export type WebColorName = ColorName | WebOnlyName;
