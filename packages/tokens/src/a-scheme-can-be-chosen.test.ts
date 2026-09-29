import { describe, expect, it } from "vitest";

import { AA_BOUNDARY, contrastRatio } from "./contrast.js";
import { cssText } from "./css.js";
import { DARK, LIGHT } from "./palette.js";
import {
  DEFAULT_THEME_CHOICE,
  isThemeChoice,
  PALETTES,
  schemeFor,
  THEME_CHOICES,
} from "./scheme.js";

/**
 * # Light, dark, or whatever the device says
 *
 * Both clients offer the same three answers and resolve them the same way, so
 * the resolving is written once, here, beside the palettes it chooses between.
 * What each client STORES and how it asks the device are its own business.
 */
describe("choosing a scheme", () => {
  it("offers the device's choice first, then light, then dark", () => {
    expect(THEME_CHOICES).toEqual(["system", "light", "dark"]);
  });

  it("follows the device until somebody says otherwise", () => {
    expect(DEFAULT_THEME_CHOICE).toBe("system");
  });

  it.each([
    ["light", "light"],
    ["dark", "dark"],
  ] as const)("follows a device that asks for %s", (device, scheme) => {
    expect(schemeFor("system", device)).toBe(scheme);
  });

  /**
   * A device that says nothing gets the scheme this product was drawn in first:
   * it is opened in a storage room at night as often as anywhere else.
   */
  it("is dark when the device has no opinion", () => {
    expect(schemeFor("system", null)).toBe("dark");
  });

  it.each([
    ["light", "dark"],
    ["dark", "light"],
  ] as const)("keeps %s whatever the device prefers (%s)", (choice, device) => {
    expect(schemeFor(choice, device)).toBe(choice);
  });

  it("recognises the three answers and nothing else", () => {
    for (const choice of THEME_CHOICES) {
      expect(isThemeChoice(choice)).toBe(true);
    }

    for (const junk of ["", "auto", "Light", null, undefined, 1]) {
      expect(isThemeChoice(junk)).toBe(false);
    }
  });

  it("hands each scheme the shared palette itself, not a copy of it", () => {
    expect(PALETTES.dark).toBe(DARK);
    expect(PALETTES.light).toBe(LIGHT);
  });
});

/**
 * # The mark's own colour
 *
 * ADR 24: lime on the ink, and NEVER lime on white. The accent cannot carry
 * that rule, because the accent fill is the same lime in both schemes, and
 * `accentText` cannot either — in the light scheme it is the dark green of a
 * link, which a logo must not be mistaken for. So the mark has a token.
 */
describe("the colour the mark is drawn in", () => {
  it("is the lime on the dark", () => {
    expect(DARK.mark).toBe(DARK.accent);
  });

  it("is the ink on the light, because the lime is never drawn on white", () => {
    expect(LIGHT.mark).toBe(LIGHT.ink);
    expect(LIGHT.mark).not.toBe(LIGHT.accent);
  });

  it.each([
    ["dark", DARK],
    ["light", LIGHT],
  ] as const)("stands out from the bar it sits on, in the %s", (_scheme, palette) => {
    expect(contrastRatio(palette.mark, palette.surfaceRaised)).toBeGreaterThanOrEqual(AA_BOUNDARY);
  });
});

/**
 * # The stylesheet obeys a choice as well as the system
 *
 * The browser used to follow `prefers-color-scheme` and nothing else. A choice
 * is a `data-theme` attribute on the root, and it has to win in BOTH
 * directions: a light choice on a dark system, and a dark choice on a light
 * one. Asserted on the text because the text is what a browser is handed; the
 * web client's suite asserts the cascade.
 */
describe("the stylesheet the browser is handed", () => {
  const CSS = cssText();

  it("still follows the system when nothing is chosen", () => {
    expect(CSS).toContain("@media (prefers-color-scheme: light)");
  });

  it("does not let the system's light override a dark choice", () => {
    expect(CSS).toMatch(
      /@media \(prefers-color-scheme: light\) \{\s*:root:not\(\[data-theme="dark"\]\) \{/u,
    );
  });

  it("paints the light scheme wherever light is chosen, whatever the system says", () => {
    const chosen = /:root\[data-theme="light"\] \{([^}]*)\}/u.exec(CSS)?.[1] ?? "";

    expect(chosen).toContain(`--color-surface: ${LIGHT.surface};`);
    expect(chosen).toContain(`--color-mark: ${LIGHT.mark};`);
  });

  it("tells the browser which scheme its own controls should be drawn in", () => {
    expect(CSS).toContain("color-scheme: dark;");
    expect(CSS).toContain("color-scheme: light;");
  });
});
