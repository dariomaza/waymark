import { render, screen } from "@testing-library/react-native";

import { LOGO, shapesOf } from "@waymark/tokens";

import { Logo } from "./logo.js";
import { colors } from "../styles/tokens.js";

/**
 * # The name, drawn
 *
 * The logo is the word "waymark" in Sora, outlined, with the pin over its w —
 * the same drawing the browser puts in its top bar, from the same numbers in
 * `@waymark/tokens`. What it has to get right is what the written name got
 * right — a screen reader still reads a name — and what a picture of a name
 * adds: its proportions, and a pin whose hole is a hole.
 */
interface Drawn {
  readonly props: Record<string, unknown>;
}

describe("the logo", () => {
  it("is read as the product's name when it stands for it", async () => {
    await render(<Logo label="Waymark" />);

    expect(screen.getByLabelText("Waymark")).toBeOnTheScreen();
  });

  /** Inside something that already carries the name, it says nothing twice. */
  it("says nothing when the name is carried by what it sits in", async () => {
    await render(<Logo />);

    expect(screen.queryByLabelText("Waymark")).toBeNull();
  });

  /**
   * Lime by default, because this app is dark always and the lime on the ink
   * IS the mark; the brand never draws it on white, and this app has no white.
   */
  it("is drawn filled, in the accent unless it is told otherwise", async () => {
    const lime = JSON.stringify((await render(<Logo />)).toJSON());
    const ink = JSON.stringify((await render(<Logo color={colors.ink} />)).toJSON());

    expect(lime).not.toMatch(/"stroke(Width)?":/u);
    expect(lime).not.toBe(ink);
  });

  /**
   * Asked for a height, it works out the width from the drawing's own box, so
   * the name is never squashed into a slot somebody guessed the width of.
   */
  it("keeps its proportions at the height it is asked for", async () => {
    const { width, height, vbWidth, vbHeight } = ((await render(<Logo height={24} />)).toJSON() as Drawn)
      .props;

    expect(height).toBe(24);
    expect(width).toBeCloseTo((24 * LOGO.width) / LOGO.height, 5);
    expect([vbWidth, vbHeight]).toEqual([LOGO.width, LOGO.height]);
  });

  /** The drawing both clients share, every outline of it. */
  it("draws every letter and the pin the tokens hold", async () => {
    const drawn = JSON.stringify((await render(<Logo />)).toJSON());

    for (const shape of shapesOf(LOGO)) {
      expect(drawn).toContain(shape.d);
    }
  });

  /**
   * The pin's ring has a hole in it, and that hole must let the bar show
   * through: without `evenodd` the ring and its hole fill as one solid
   * diamond, and the QR code's finder square is gone.
   */
  it("leaves the hole in the pin's ring open", async () => {
    const drawn = JSON.stringify((await render(<Logo />)).toJSON());

    expect(drawn.match(/"fillRule":0/gu) ?? []).toHaveLength(
      shapesOf(LOGO).filter((shape) => shape.evenOdd === true).length,
    );
  });
});
