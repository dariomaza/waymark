import { contrastRatio, MEASURED } from "./contrast.js";
import {
  DARK,
  DARK_WEB_ONLY,
  LIGHT,
  LIGHT_WEB_ONLY,
  type Palette,
  type WebOnlyPalette,
} from "./palette.js";
import { BAR_HEIGHT, RADIUS, SPACE, TEXT } from "./scale.js";

/**
 * # The browser's half of the palette, rendered rather than written
 *
 * CSS cannot import a TypeScript module, so the one thing that could not be a
 * shared import had to become a shared OUTPUT. `apps/web/src/ui/styles/
 * tokens.css` is the text this function returns, checked into the repository
 * so that nothing has to run before Vite does, and asserted byte for byte by
 * a test in the web client.
 *
 * That test is the whole guarantee. Editing the CSS by hand fails it; changing
 * a colour here without regenerating fails it; and the fix in both directions
 * is one command, `pnpm --filter @waymark/tokens generate`. There is no path
 * where the two clients hold different values and everything is green.
 *
 * The prose is generated with it, deliberately. A generated file whose
 * comments are hand-maintained is a file with a hand-maintained half, and the
 * half that explains WHY a token exists is the half worth keeping true.
 */

/** `surfaceRaised` becomes `surface-raised`: the names are the same names. */
const kebab = (name: string): string => name.replaceAll(/[A-Z]/gu, (upper) => `-${upper.toLowerCase()}`);

const rem = (pixels: number): string => `${String(pixels / 16)}rem`;

/** The measured ratios for one scheme, as the block of evidence they are. */
const evidenceFor = (scheme: "dark" | "light"): string =>
  MEASURED.filter((pair) => pair.scheme === scheme)
    .map((pair) => ` *   ${`${kebab(pair.of)}/${kebab(pair.on)}`.padEnd(28)}${pair.ratio.toFixed(2)}`)
    .join("\n");

const colorLines = (palette: Palette, webOnly: WebOnlyPalette, indent: string): string =>
  [
    ...Object.entries(palette).map(([name, value]) => `${indent}--color-${kebab(name)}: ${value};`),
    ...Object.entries(webOnly).map(([name, value]) => `${indent}--color-${kebab(name)}: ${value};`),
  ].join("\n");

export const cssText = (): string => `/**
 * The whole visual vocabulary, in one place — and this is not that place.
 *
 * GENERATED FROM \`@waymark/tokens\`. Do not edit: run
 * \`pnpm --filter @waymark/tokens generate\`. A hand edit here fails
 * \`tokens-are-generated.test.ts\`, which compares this file with what the
 * package renders, character for character.
 *
 * The values, the reasoning behind them and the measurements below all live in
 * \`packages/tokens/src\`. They used to live here AND in
 * \`apps/mobile/src/ui/styles/tokens.ts\`, which is how the two clients came to
 * read as two products on one phone. See ADR 22.
 *
 * # Why the surfaces are neutral and only the accent has colour
 *
 * They were not. Every token used to sit between hue 74 and hue 111 — the
 * surfaces, the lines, the muted text and the accent were all olive — and an
 * accent only means "look here" when it is the one saturated thing on screen.
 * Against a world made of itself it means nothing. So the greys are grey now,
 * and the lime is the only colour in the file.
 *
 * # Why the accent is four tokens and not one
 *
 * An accent does two jobs with opposite requirements: it fills a button, and
 * it is a foreground on the page. One value cannot do both across two colour
 * schemes, and trying is what made the old palette look like two different
 * products — the accent was 62% lightness in the dark and 25% in the light.
 *
 * Split by job, the FILL can be the same lime in both schemes, which is where
 * the brand is actually perceived: the button is the largest accent surface on
 * any screen. Only \`--color-accent-text\` differs, and nobody reads a thin
 * foreground as "a different colour".
 *
 * Contrast, measured — and recomputed from these very values by
 * \`the-measurements-are-real.test.ts\`, so none of these numbers can go stale
 * behind a colour that moved:
 *
 * dark
${evidenceFor("dark")}
 *
 * light
${evidenceFor("light")}
 *
 * The mobile client carries the same dark values, from the same package. It
 * has no light scheme on purpose: a phone held over a box does not get that
 * choice, because the camera screen is black either way.
 */
:root {
${colorLines(DARK, DARK_WEB_ONLY, "  ")}

${Object.entries(SPACE)
  .map(([name, value]) => `  --space-${name.slice(1)}: ${rem(value)};`)
  .join("\n")}

${Object.entries(RADIUS)
  .map(([name, value]) => `  --radius-${name}: ${String(value)}px;`)
  .join("\n")}

${Object.entries(TEXT)
  .map(([name, value]) => `  --text-${name}: ${rem(value)};`)
  .join("\n")}

  --bar-height: ${String(BAR_HEIGHT)}px;
}

/**
 * The second scheme, which only this client has.
 *
 * The lime fill is the token that changes character here and it is the one
 * that does NOT change value: the same \`--color-accent\` with the same ink on
 * it, at ${contrastRatio(LIGHT.accentInk, LIGHT.accent).toFixed(2)} either way. What moves is the accent as a FOREGROUND,
 * which is unreadable as lime on near-white, and the fill's EDGE — because
 * here the fill has only ${contrastRatio(LIGHT.accent, LIGHT.surface).toFixed(2)} against the page. It LOOKS visible, the
 * hue being loud, but its silhouette is not, and a component boundary needs
 * ${String(3)}. \`--color-accent-border\` is ${contrastRatio(LIGHT_WEB_ONLY.accentBorder, LIGHT.surface).toFixed(2)} here, so the button has a shape as
 * well as a colour; without it the button reads fine on a desk and disappears
 * on a phone in daylight.
 */
@media (prefers-color-scheme: light) {
  :root {
${colorLines(LIGHT, LIGHT_WEB_ONLY, "    ")}
  }
}
`;
