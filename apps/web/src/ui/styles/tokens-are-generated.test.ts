import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cssText, DARK, LIGHT } from "@waymark/tokens";
import { describe, expect, it } from "vitest";

/**
 * # This is the half of the drift guard that a type system cannot reach
 *
 * The phone takes the palette by IMPORTING it: `ui/styles/tokens.ts` re-exports
 * the objects in `@waymark/tokens`, so a colour changed there is changed on the
 * phone with nothing in between and nothing to forget.
 *
 * CSS cannot import a TypeScript module, so this client cannot do that. Its
 * stylesheet is GENERATED from the same objects and checked in, and this is
 * what makes the generation binding rather than advisory:
 *
 * - somebody edits `tokens.css` by hand and the file stops matching — fails;
 * - somebody changes a value in the package and does not regenerate — fails;
 * - somebody deletes the package's hold on this file entirely — fails.
 *
 * It is the same shape of guard as `parity.test.ts` in `@waymark/i18n`, and it
 * exists for the same reason: the compiler covers everything up to the point
 * where the value leaves TypeScript, and a string in a `.css` file is past
 * that point. The dictionary's placeholders were the other thing past it.
 *
 * The failure message has to name the fix, because the first person to hit
 * this will have changed a colour and will have no idea why a stylesheet is
 * complaining.
 */
const TOKENS = join(process.cwd(), "src/ui/styles/tokens.css");

describe("the stylesheet this client actually loads", () => {
  it("is exactly what the shared token package renders", () => {
    expect(readFileSync(TOKENS, "utf8")).toBe(cssText());
  });

  /**
   * The control. If `cssText()` returned something that was not a stylesheet
   * at all — an empty string, say — the assertion above would still pass the
   * day somebody emptied the file to match. These say the comparison has a
   * palette on both sides of it.
   */
  it("declares every colour the shared source names, in the dark", () => {
    const css = readFileSync(TOKENS, "utf8");

    for (const [name, value] of Object.entries(DARK)) {
      expect(css).toContain(`: ${value};`);
      expect(css).toContain(`--color-${name.replaceAll(/[A-Z]/gu, (u) => `-${u.toLowerCase()}`)}:`);
    }
  });

  it("keeps a light scheme", () => {
    const css = readFileSync(TOKENS, "utf8");

    expect(css).toContain("@media (prefers-color-scheme: light)");
    expect(css).toContain(`--color-surface: ${LIGHT.surface};`);
  });

  /**
   * The lime fill's edge, asserted from this side too: transparent in the
   * dark, where the fill needs no rescue, and load bearing in the light. Both
   * clients have it since the phone gained the light scheme (ADR 25).
   */
  it("still has the accent border the light scheme needs", () => {
    const css = readFileSync(TOKENS, "utf8");

    expect(css).toContain("--color-accent-border: transparent;");
    expect(css).toContain(`--color-accent-border: ${LIGHT.accentBorder};`);
  });
});
