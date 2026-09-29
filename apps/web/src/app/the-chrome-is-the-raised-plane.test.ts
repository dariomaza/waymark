import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * # The bar at the top and the bar at the bottom are the same plane
 *
 * They were not. This client painted both with `--color-surface-sunken`,
 * which is DARKER than the page; the phone client paints both with
 * `surfaceRaised`, which is LIGHTER than it. Two clients, on one phone, with
 * the chrome inverted between them — which is exactly the sort of difference
 * that has no name and is impossible to unsee.
 *
 * Raised won, and not by a coin toss:
 *
 * - Both bars are a layer the page scrolls UNDERNEATH. A surface that content
 *   passes beneath is above the page; `sunken` names the opposite of what is
 *   happening.
 * - `sunken` is the token for a recess, and everywhere else in both clients
 *   that is all it is: a text field, an option list, a toggle's track, the
 *   grey behind a photo that has not loaded. The chrome was the one caller
 *   using it to mean "a different surface", which made the token mean two
 *   things.
 * - In the light scheme `sunken` is #f0f0f2 against a #fafafa page, so the
 *   bars read as a dirty strip along each edge. Raised is #ffffff there: the
 *   chrome is the lifted plane in both schemes rather than in neither.
 *
 * ## The claim this file actually asserts
 *
 * Not "the CSS says `raised`" — that is a spelling. The claim is that the
 * chrome is LIGHTER THAN THE PAGE, in both colour schemes, which is the thing
 * a person sees and the thing the phone client does. The mobile suite asserts
 * the same sentence about its own tokens, so the two clients are held to one
 * property rather than to one another's file layout.
 */

const STYLES = join(process.cwd(), "src/ui/styles");
const TOKENS = readFileSync(join(STYLES, "tokens.css"), "utf8");
const BASE = readFileSync(join(STYLES, "base.css"), "utf8");

/**
 * The two schemes: the plain `:root` block, and the one a light choice
 * applies. The system's light is the same declarations inside a media query,
 * which jsdom will not evaluate — and `a-scheme-can-be-chosen.test.ts` holds
 * the two copies to each other — so the chosen block stands for both.
 */
const schemes = (): ReadonlyMap<string, string> => {
  const dark = /:root\s*\{([^}]*)\}/u.exec(TOKENS)?.[1];
  const light = /:root\[data-theme="light"\]\s*\{([^}]*)\}/u.exec(TOKENS)?.[1];
  if (dark === undefined || light === undefined) {
    throw new Error("tokens.css no longer has a dark and a light :root");
  }

  return new Map([
    ["dark", dark],
    ["light", `${dark}${light}`],
  ]);
};

/** `#191a1b` as the three numbers, so two surfaces can be compared. */
const brightnessOf = (hex: string): number => {
  const found = /^#([\da-f]{6})$/iu.exec(hex.trim());
  if (found?.[1] === undefined) {
    throw new Error(`that is not a six-digit colour: ${hex}`);
  }

  const value = Number.parseInt(found[1], 16);

  // Rec. 601 luma. Any monotonic measure would do here; what matters is that
  // "lighter" is decided by a number rather than by reading the hex.
  // eslint-disable-next-line no-bitwise
  return 0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
};

const tokenIn = (scheme: string, name: string): string => {
  const declarations = schemes().get(scheme);
  if (declarations === undefined) {
    throw new Error(`no such scheme: ${scheme}`);
  }

  const found = [...declarations.matchAll(new RegExp(`${name}:\\s*([^;]+);`, "gu"))].at(-1);
  if (found?.[1] === undefined) {
    throw new Error(`no ${name} in the ${scheme} scheme`);
  }

  return found[1].trim();
};

/** What the cascade paints on an element, once every stylesheet has had its say. */
const paintedOn = (
  selector: string,
  markup: string,
  sheets: readonly string[],
): CSSStyleDeclaration => {
  document.head.innerHTML = `<style>${TOKENS}${BASE}${sheets.join("")}</style>`;
  document.body.innerHTML = markup;

  const element = document.querySelector(selector);
  if (element === null) {
    throw new Error(`that markup has no ${selector} in it`);
  }

  return globalThis.getComputedStyle(element);
};

const APP_BAR = readFileSync(join(process.cwd(), "src/ui/organisms/app-bar.css"), "utf8");
const BOTTOM_NAV = readFileSync(join(process.cwd(), "src/ui/organisms/bottom-nav.css"), "utf8");
const APP_SHELL = readFileSync(join(process.cwd(), "src/app/app-shell.css"), "utf8");

describe("the surface the chrome is painted on", () => {
  /**
   * The control. If `raised` were not lighter than the page to begin with,
   * every assertion below would be a tautology about a token name.
   */
  it.each(["dark", "light"])("is a lighter plane than the page, in the %s scheme", (scheme) => {
    expect(brightnessOf(tokenIn(scheme, "--color-surface-raised"))).toBeGreaterThan(
      brightnessOf(tokenIn(scheme, "--color-surface")),
    );
  });

  it.each(["dark", "light"])("is not the recess, which is darker, in the %s scheme", (scheme) => {
    expect(brightnessOf(tokenIn(scheme, "--color-surface-sunken"))).toBeLessThan(
      brightnessOf(tokenIn(scheme, "--color-surface")),
    );
  });

  it("is what the top bar is painted with", () => {
    expect(paintedOn(".app-bar", `<header class="app-bar"></header>`, [APP_BAR]).background).toBe(
      "var(--color-surface-raised)",
    );
  });

  it("is what the bar at the bottom is painted with", () => {
    expect(
      paintedOn(".bottom-nav", `<nav class="bottom-nav"></nav>`, [BOTTOM_NAV]).background,
    ).toBe("var(--color-surface-raised)");
  });
});

/**
 * # The mark is the product's, and a product has one colour
 *
 * The logo in the top bar — the name with the pin over its w — is drawn lime
 * on the phone, and it once came out white here because this client passed
 * no colour and it inherited the ink around it. A mark that is two colours in
 * two places is not a mark.
 *
 * It takes `--color-mark`, which exists for exactly this: lime on the dark,
 * and INK on the light. The brand's one hard rule is that the lime is never
 * drawn on white (1.26:1, which is not a mark but a stain) — and not the
 * darker green `--color-accent-text` becomes there either, which is a link's
 * colour, and a logo the colour of the links beside it reads as one of them.
 *
 * It used to be `--color-accent-text` plus a `prefers-color-scheme` override
 * in the shell's stylesheet. A scheme can be CHOSEN now (ADR 25), and a media
 * query cannot see a choice; a token that each scheme sets can.
 */
describe("the product's mark in the top bar", () => {
  const MARKUP = `<header class="app-bar"><span class="app-shell__mark"></span></header>`;

  it("is drawn in the mark's own colour, the way the phone draws it", () => {
    expect(paintedOn(".app-shell__mark", MARKUP, [APP_BAR, APP_SHELL]).color).toBe(
      "var(--color-mark)",
    );
  });

  it("is the lime in the dark, not the ink the words around it are", () => {
    expect(tokenIn("dark", "--color-mark")).toBe(tokenIn("dark", "--color-accent"));
    expect(tokenIn("dark", "--color-mark")).not.toBe(tokenIn("dark", "--color-ink"));
  });

  it("is ink in the light scheme, because the lime is never drawn on white", () => {
    expect(tokenIn("light", "--color-mark")).toBe(tokenIn("light", "--color-ink"));
  });
});
