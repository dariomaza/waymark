import { DARK, RADIUS, SPACE, TEXT } from "@waymark/tokens";

/**
 * # The whole visual vocabulary, and none of it is written here
 *
 * This used to be a hand-written copy of `apps/web/src/ui/styles/tokens.css` —
 * the same hex strings, the same spacing steps, the same type sizes, in a
 * second syntax — kept in step by whoever last remembered. That is the same
 * arrangement ADR 20 found in the two icon files, and it failed the same way:
 * not loudly, but by one client quietly becoming a slightly different product.
 *
 * The values now live in `@waymark/tokens` and this file re-exports them, so a
 * colour changed there is changed here with nothing in between. See ADR 22.
 *
 * ## What this file is still FOR
 *
 * The names. `colors`, `space`, `radius` and `text` are what thirty components
 * in this app import, and they are this platform's spelling of the shared
 * vocabulary — the same seam `ui/atoms/icon.tsx` is for lucide (ADR 20). The
 * package's `DARK` is not a name a StyleSheet should have to know, and keeping
 * the seam is what would make a second source, or a themed variant, a change
 * to one file rather than to thirty.
 *
 * ## Dark, always, and the one token that is deliberately missing
 *
 * This is opened in a storage room at night as often as anywhere else, and a
 * white screen at arm's length in the dark is the difference between reading a
 * label and turning the phone away. The web client follows the system; a phone
 * held over a box does not get that choice, because the camera screen is black
 * either way. So `DARK` is the only scheme this client takes, and the shared
 * package's `LIGHT` is not imported here at all.
 *
 * The browser has two tokens this one has not, and both are absent rather than
 * transparent, to keep this file honest about what the platform actually
 * needs:
 *
 * - `accentBorder`, because on the light scheme the lime fill has only 1.26
 *   contrast against the page and its silhouette needs rescuing. Here the fill
 *   is at 14.51 and needs nothing.
 * - `focus`, because React Native has no `:focus-visible` and no keyboard
 *   focus to draw a ring around. The press state is this platform's answer.
 *
 * Those numbers are not claims. `@waymark/tokens` recomputes them from the
 * colours on every test run.
 */
export const colors = DARK;

export const space = SPACE;

export const radius = RADIUS;

export const text = TEXT;

/**
 * Nothing tappable is smaller than this. The app is used one-handed, standing
 * up, sometimes on a step ladder.
 */
export { TAP_TARGET } from "@waymark/tokens";
