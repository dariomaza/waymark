import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DARK, RADIUS, SPACE, TAP_TARGET as SHARED_TAP_TARGET, TEXT } from "@waymark/tokens";

import { colors, radius, space, TAP_TARGET, text } from "./tokens.js";

/**
 * # The phone and the browser cannot hold different values, because there is
 * one set of values
 *
 * This file used to be a hand-written copy of `apps/web/src/ui/styles/
 * tokens.css`: the same thirteen hex strings, the same six spacing steps, the
 * same four type sizes, in a second syntax. It agreed with the browser by
 * vigilance, which is not a mechanism — and the drift it eventually allowed is
 * the subject of ADR 22.
 *
 * Now `tokens.ts` re-EXPORTS the shared objects, so there is nothing to keep in
 * step. That is a stronger guarantee than any assertion could be, and these
 * tests exist to stop somebody quietly undoing it: the first says the phone's
 * palette IS the shared one rather than a copy that currently matches, and the
 * second says the file declares no colour of its own for the next person to
 * edit instead of the package.
 *
 * `toBe` and not `toEqual`, deliberately. `toEqual` passes for a copy that
 * happens to agree today, which is exactly the state this whole change exists
 * to make impossible.
 */
describe("the palette this client draws with", () => {
  it("is the shared one, and not a copy that currently agrees with it", () => {
    expect(colors).toBe(DARK);
  });

  it("takes its spacing, radii and type sizes from the same place", () => {
    expect(space).toBe(SPACE);
    expect(radius).toBe(RADIUS);
    expect(text).toBe(TEXT);
    expect(TAP_TARGET).toBe(SHARED_TAP_TARGET);
  });
});

/**
 * The guard against the easy regression: somebody needs a colour in a hurry,
 * types it here, and the file is a partial copy again. A hex literal in this
 * file is that happening, so this fails on the line it is written rather than
 * eighteen months later on a phone in a garage.
 */
describe("this file", () => {
  const SOURCE = readFileSync(join(__dirname, "tokens.ts"), "utf8");

  it("writes down no colour of its own", () => {
    expect(SOURCE).not.toMatch(/#[\da-f]{3,8}\b/iu);
  });

  it("is short, because everything it used to say is said in one place now", () => {
    expect(SOURCE.split("\n").length).toBeLessThan(90);
  });
});

/**
 * The accent's border is the token this arrangement had to keep ASYMMETRIC.
 *
 * On the light scheme the lime fill has 1.26 contrast against the page and
 * needs an edge to have a silhouette at all; in the dark it is at 14.51 and
 * needs none. So the browser has `--color-accent-border` and this client has
 * no such token — absent rather than transparent, to keep this file honest
 * about what the platform actually needs.
 *
 * A shared palette that had quietly given both clients every token would have
 * traded that honesty for tidiness. This says it did not.
 */
describe("the tokens the browser has and this client does not", () => {
  it("does not hand the phone an accent border it has no use for", () => {
    expect(colors).not.toHaveProperty("accentBorder");
  });

  it("does not hand it a focus ring either, there being no keyboard focus to ring", () => {
    expect(colors).not.toHaveProperty("focus");
  });
});
