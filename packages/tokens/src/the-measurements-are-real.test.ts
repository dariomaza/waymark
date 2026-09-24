import { describe, expect, it } from "vitest";

import { contrastRatio, MEASURED } from "./contrast.js";
import {
  DARK,
  DARK_WEB_ONLY,
  LIGHT,
  LIGHT_WEB_ONLY,
  type WebColorName,
} from "./palette.js";

/**
 * # The contrast numbers in this package are measurements, not decoration
 *
 * Every palette file in this product has carried a block of ratios in a
 * comment — `accent/surface 14.51`, `muted/raised 7.31` — and a comment is
 * exactly as true as the last person to edit the value beside it. Somebody
 * darkens `--color-ink-muted` by two points to taste, the comment still says
 * 7.98, and the number that was evidence becomes a claim nobody can check
 * without opening a contrast tool and knowing which two colours to put in it.
 *
 * So the ratios are not written down here. They are RECOMPUTED from the hex
 * values on every test run and compared with what the package claims, which
 * means a colour that moves either updates its own evidence or fails.
 *
 * `contrastRatio` is the WCAG 2 definition — relative luminance with the
 * sRGB transfer curve, lighter plus 0.05 over darker plus 0.05 — and the
 * eight numbers the two old files carried reproduce to the last digit, which
 * is the evidence that this is the same function whoever measured them used.
 */
describe("every ratio this package publishes", () => {
  it("is more than a couple of pairs, or this test is guarding a rounding rule", () => {
    expect(MEASURED.length).toBeGreaterThan(8);
  });

  it.each(MEASURED.map((pair) => [`${pair.scheme} ${pair.of}/${pair.on}`, pair]))(
    "is the ratio those two colours actually have, for %s",
    (_name, pair) => {
      const scheme: Record<WebColorName, string> =
        pair.scheme === "dark"
          ? { ...DARK, ...DARK_WEB_ONLY }
          : { ...LIGHT, ...LIGHT_WEB_ONLY };

      expect(contrastRatio(scheme[pair.of], scheme[pair.on])).toBeCloseTo(pair.ratio, 2);
    },
  );

  it.each(MEASURED.filter((pair) => pair.needs > 0).map((pair) => [`${pair.of}/${pair.on}`, pair]))(
    "clears the threshold its job requires, for %s",
    (_name, pair) => {
      expect(pair.ratio).toBeGreaterThanOrEqual(pair.needs);
    },
  );
});

/**
 * # The one pair that FAILS, and the token that exists because it does
 *
 * The lime fill on the light scheme's surface is 1.26. It looks visible,
 * because the hue is loud, but a component boundary needs 3 and a silhouette
 * at 1.26 is not one. `accentBorder` is what rescues it, at 3.24.
 *
 * This is asserted rather than described because it is the entire argument for
 * a token that exists on one client and not the other, and an argument nobody
 * can re-run is an argument the next person deletes.
 */
describe("the lime fill on the light scheme", () => {
  it("has no silhouette of its own", () => {
    expect(contrastRatio(LIGHT.accent, LIGHT.surface)).toBeLessThan(3);
  });

  it("is given one by the border token, which is why that token exists", () => {
    expect(contrastRatio(LIGHT_WEB_ONLY.accentBorder, LIGHT.surface)).toBeGreaterThanOrEqual(3);
  });

  it("needs no such rescue in the dark, which is why the phone has no such token", () => {
    expect(contrastRatio(DARK.accent, DARK.surface)).toBeGreaterThanOrEqual(3);
  });
});
