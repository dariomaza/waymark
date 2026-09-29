import { RADIUS, SPACE, TEXT } from "@waymark/tokens";

/**
 * # The visual vocabulary that does not change with the scheme
 *
 * This used to be a hand-written copy of `apps/web/src/ui/styles/tokens.css` —
 * the same hex strings, the same spacing steps, the same type sizes, in a
 * second syntax — kept in step by whoever last remembered. The values now
 * live in `@waymark/tokens` and this file re-exports them, so a value changed
 * there is changed here with nothing in between. See ADR 22.
 *
 * ## Where the colours went
 *
 * This file exported `colors`, which was the dark palette, fixed at import
 * time: the app was dark only. It has two schemes now and a switch between
 * them (ADR 25), so a colour is a fact about the moment rather than about the
 * module, and it comes from `theme.tsx` — `useColors()` while drawing, and
 * `themed()` for a stylesheet. There is deliberately no static palette left
 * here: an import of one would be a screen stuck in the dark.
 *
 * ## What this file is still FOR
 *
 * The names. `space`, `radius` and `text` are what thirty components in this
 * app import, and they are this platform's spelling of the shared vocabulary —
 * the same seam `ui/atoms/icon.tsx` is for lucide (ADR 20).
 */
export const space = SPACE;

export const radius = RADIUS;

export const text = TEXT;

/**
 * Nothing tappable is smaller than this. The app is used one-handed, standing
 * up, sometimes on a step ladder.
 */
export { TAP_TARGET } from "@waymark/tokens";

/**
 * How heavy the word under a tab-bar icon is.
 *
 * Here because this client was not choosing it at all: React Navigation's own
 * default is 500 and the browser's stylesheet said 650, which is one product
 * with two bars on the owner's one phone. The size beside it was settled in
 * ADR 22; this is the half that was left behind.
 */
export { TAB_LABEL_WEIGHT } from "@waymark/tokens";
