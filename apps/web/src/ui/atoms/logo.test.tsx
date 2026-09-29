import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LOGO, shapesOf } from "@waymark/tokens";

import { Logo } from "./logo.js";

/**
 * # The name, drawn
 *
 * The logo is the word "waymark" in Sora, outlined, with the pin over its w.
 * It stands where the product's name is written, so what it has to get right
 * is what the written name got right — a screen reader still reads a name —
 * and what a picture of a name adds: its proportions, and a pin whose hole is
 * a hole.
 */
describe("the logo", () => {
  it("is read as the product's name, because it is the product's name", () => {
    render(<Logo label="Waymark" />);

    expect(screen.getByRole("img", { name: "Waymark" })).toBeInTheDocument();
  });

  /**
   * Filled in the colour around it, like a word. The caller decides that
   * colour — the top bar makes it the accent — so the logo carries none.
   */
  it("is drawn filled, in the colour around it, with no pen", () => {
    const { container } = render(<Logo label="Waymark" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("fill", "currentColor");
    expect(svg).not.toHaveAttribute("stroke");
  });

  /**
   * Asked for a height, it works out the width from the drawing's own box, so
   * the name is never squashed into a slot somebody guessed the width of.
   */
  it("keeps its proportions at the height it is asked for", () => {
    const { container } = render(<Logo label="Waymark" height={24} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("viewBox", LOGO.viewBox);
    expect(Number(svg?.getAttribute("height"))).toBe(24);
    expect(Number(svg?.getAttribute("width"))).toBeCloseTo((24 * LOGO.width) / LOGO.height, 5);
  });

  /** The drawing both clients share, every outline of it, in painting order. */
  it("draws every letter and the pin the tokens hold", () => {
    const { container } = render(<Logo label="Waymark" />);

    expect([...container.querySelectorAll("svg path")].map((path) => path.getAttribute("d"))).toEqual(
      shapesOf(LOGO).map((shape) => shape.d),
    );
  });

  /**
   * The pin's ring has a hole in it, and that hole must let the bar show
   * through rather than be painted over: without `evenodd` the ring and its
   * hole fill as one solid diamond, and the QR code's finder square is gone.
   */
  it("leaves the hole in the pin's ring open", () => {
    const { container } = render(<Logo label="Waymark" />);

    expect(container.querySelectorAll('svg path[fill-rule="evenodd"]')).toHaveLength(
      shapesOf(LOGO).filter((shape) => shape.evenOdd === true).length,
    );
    expect(container.querySelectorAll('svg path[fill-rule="evenodd"]')).not.toHaveLength(0);
  });
});
