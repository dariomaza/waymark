import { aSession } from "@waymark/api-client/testing";

import { fireEvent, renderApp, screen, waitFor } from "../testing/render-app.js";
import { theApiKnowsTheHouse } from "../testing/the-house.js";
import { colors } from "../ui/styles/tokens.js";

/**
 * # The bar at the top and the bar at the bottom are the same plane
 *
 * This client has always painted both with `surfaceRaised`, which is lighter
 * than the page. The web client painted both with `surfaceSunken`, which is
 * darker than it — so the chrome was INVERTED between two clients the owner
 * uses on the same phone. Raised won, because the page scrolls underneath the
 * bars and `sunken` is the recess token everywhere else in both clients.
 *
 * The web suite asserts the same sentence about its own tokens. Neither file
 * reads the other's: they are held to one PROPERTY — the chrome is lighter
 * than the page — which is the thing a person sees.
 */

/** Rec. 601 luma, so "lighter" is decided by a number and not by reading a hex. */
const brightnessOf = (hex: string): number => {
  const found = /^#([\da-f]{6})$/iu.exec(hex);
  if (found?.[1] === undefined) {
    throw new Error(`that is not a six-digit colour: ${hex}`);
  }

  const value = Number.parseInt(found[1], 16);

  return (
    0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)
  );
};

describe("the surface the chrome is painted on", () => {
  it("is a lighter plane than the page", () => {
    expect(brightnessOf(colors.surfaceRaised)).toBeGreaterThan(brightnessOf(colors.surface));
  });

  it("is not the recess, which is darker", () => {
    expect(brightnessOf(colors.surfaceSunken)).toBeLessThan(brightnessOf(colors.surface));
  });
});

/**
 * # Which tab you are on, stated twice
 *
 * The web client marks the tab you are on two ways: the word and the drawing
 * turn lime, and a 2px lime rule is drawn along the top edge of that tab. This
 * client had only the tint.
 *
 * A tint is a colour difference and nothing else, which is the one kind of
 * difference that goes missing in bright sunlight, on a cheap panel, and for
 * roughly one man in twelve. The rule is a SHAPE, and it is also the thing the
 * eye catches first when the bar is glanced at rather than read.
 */
describe("the tab you are on", () => {
  beforeEach(() => {
    theApiKnowsTheHouse();
  });

  it("carries a rule along its top edge, in the accent", async () => {
    await renderApp({ session: aSession() });

    await screen.findByText(/scan a label/i);

    expect(screen.getByRole("button", { name: "Scan" })).toHaveStyle({
      borderTopWidth: 2,
      borderTopColor: colors.accentText,
    });
  });

  /**
   * The half that makes the other half mean something: a rule on every tab is
   * a border, not an indicator.
   */
  it("is the only tab carrying one", async () => {
    await renderApp({ session: aSession() });

    await screen.findByText(/scan a label/i);

    for (const word of ["Places", "Things", "Search"]) {
      expect(screen.getByRole("button", { name: word })).toHaveStyle({
        borderTopColor: "transparent",
      });
    }
  });

  /**
   * And it MOVES. A rule nailed to the first tab would pass both assertions
   * above on a phone that has opened the app and touched nothing.
   */
  it("moves to the tab that was tapped", async () => {
    await renderApp({ session: aSession() });

    await screen.findByText(/scan a label/i);

    await fireEvent.press(screen.getByRole("button", { name: "Places" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Places" })).toHaveStyle({
        borderTopColor: colors.accentText,
      });
    });
    expect(screen.getByRole("button", { name: "Scan" })).toHaveStyle({
      borderTopColor: "transparent",
    });
  });
});
