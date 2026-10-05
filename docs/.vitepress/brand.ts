import {
  DARK,
  LIGHT,
  LOGO,
  MARK_SMALL,
  shapesOf,
  type Drawing,
  type Palette,
} from "../../packages/tokens/src/index.js";

/**
 * # The site's colours and mark, derived from `@waymark/tokens`
 *
 * The same spirit as `apps/web/src/ui/styles/tokens.css`: no colour is written
 * here, every value is read from the shared palette when the site builds. A
 * change to the tokens changes the site on its next build, and there is no
 * second copy to drift.
 *
 * The import is by path, not by `@waymark/tokens`, because VitePress loads its
 * config through Vite's config bundler, which leaves a package reached through
 * `node_modules` for Node to import as it is — and Node cannot follow the
 * package's `.js` specifiers to its `.ts` source. A path is bundled instead.
 * The dependency is still declared in `docs/package.json`, so pnpm and anyone
 * reading the manifest know the site is built from the tokens.
 */

/** VitePress's theme variables, each one named after the token it takes. */
const themeVariables = (palette: Palette): Record<string, string> => ({
  "--vp-c-bg": palette.surface,
  "--vp-c-bg-alt": palette.surfaceSunken,
  "--vp-c-bg-elv": palette.surfaceRaised,
  "--vp-c-bg-soft": palette.surfaceSunken,

  "--vp-c-text-1": palette.ink,
  "--vp-c-text-2": palette.inkMuted,
  "--vp-c-text-3": palette.inkMuted,

  "--vp-c-divider": palette.line,
  "--vp-c-border": palette.line,
  "--vp-c-gutter": palette.line,

  // The accent as a foreground: links, the active sidebar entry.
  "--vp-c-brand-1": palette.accentText,
  "--vp-c-brand-2": palette.accentText,
  "--vp-c-brand-3": palette.accentText,
  "--vp-c-brand-soft": `color-mix(in srgb, ${palette.accent} 18%, transparent)`,

  // The lime fill with its own ink, and its edge where the page needs one.
  "--vp-button-brand-bg": palette.accent,
  "--vp-button-brand-hover-bg": palette.accent,
  "--vp-button-brand-active-bg": palette.accent,
  "--vp-button-brand-text": palette.accentInk,
  "--vp-button-brand-hover-text": palette.accentInk,
  "--vp-button-brand-active-text": palette.accentInk,
  "--vp-button-brand-border": palette.accentBorder,
  "--vp-button-brand-hover-border": palette.accentBorder,
  "--vp-button-brand-active-border": palette.accentBorder,

  // The name on the home page is the mark's colour: lime on the ink, the ink
  // on the light page, never lime on white (ADR 24, ADR 25).
  "--vp-home-hero-name-color": palette.mark,

  "--vp-c-danger-1": palette.danger,
  "--vp-c-warning-1": palette.warning,
});

const block = (selector: string, palette: Palette): string =>
  `${selector} {\n${Object.entries(themeVariables(palette))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n")}\n}\n`;

/** Light on `:root`, dark on VitePress's `.dark`, which its switch toggles. */
export const themeCss = (): string =>
  `/* Generated from @waymark/tokens by docs/.vitepress/brand.ts. */\n${block(":root", LIGHT)}\n${block(".dark", DARK)}`;

const paths = (drawing: Drawing): string =>
  shapesOf(drawing)
    .map((shape) => `<path d="${shape.d}"${shape.evenOdd ? ' fill-rule="evenodd"' : ""}/>`)
    .join("");

const dataUri = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** The full logo, the name with the pin over its w, in a scheme's mark colour. */
export const logo = (palette: Palette): string =>
  dataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO.viewBox}" width="${LOGO.width}" height="${LOGO.height}" fill="${palette.mark}">${paths(LOGO)}</svg>`,
  );

/**
 * The favicon: the small cut on the ink tile, lime on ink, laid out exactly as
 * `apps/web/public/favicon.svg` lays it out (ADR 24: a favicon is icon size,
 * so it draws the solid pin).
 */
export const favicon = (): string =>
  dataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${DARK.surface}"/><svg x="3.2" y="3.2" width="57.6" height="57.6" viewBox="${MARK_SMALL.viewBox}" fill="${DARK.mark}">${paths(MARK_SMALL)}</svg></svg>`,
  );

/** The browser chrome's colour, per scheme. */
export const themeColor = { light: LIGHT.surface, dark: DARK.surface } as const;
