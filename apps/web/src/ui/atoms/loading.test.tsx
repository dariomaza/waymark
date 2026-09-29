import { render, screen } from "@testing-library/react";
import { PIN_DROP, SYMBOL } from "@waymark/tokens";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { drawn, sheet, TOKENS } from "../../testing/drawn.js";
import { Loading } from "./loading.js";

/**
 * # The wait is the mark finding its place
 *
 * "Quiero que hagas la carga animada con nuestro logo, para eso lo hemos
 * creado." The pulsing dot was a placeholder for a mark the product did not
 * have yet. Now the w stays put and the pin drops onto it, settles, rests and
 * lifts — the "found it" moment — on the clock in `@waymark/tokens`
 * (`PIN_DROP`), which the phone's wait runs too.
 *
 * jsdom runs no animation, so what is asserted is what the cascade hands the
 * browser: which part moves, on which keyframes, for how long, and that
 * somebody who asked for less motion gets a still mark.
 */
const LOADING = sheet("ui/atoms/loading.css");
const MARKUP = renderToStaticMarkup(<Loading label="Finding that box" />);

/** The block a browser applies when reduced motion is asked for; jsdom evaluates no media query. */
const stillRulesOf = (css: string): string => {
  const found = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*)\}\s*$/u.exec(css);
  if (found?.[1] === undefined) {
    throw new Error("that sheet says nothing about reduced motion");
  }

  return found[1];
};

describe("waiting for something", () => {
  it("still says what it is waiting for, which is the whole point of it", () => {
    render(<Loading label="Finding that box" />);

    expect(screen.getByRole("status")).toHaveTextContent("Finding that box");
  });

  it("draws the symbol — the approved w and pin — and hides it from a screen reader", () => {
    const { container } = render(<Loading label="Finding that box" />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("viewBox")).toBe(SYMBOL.viewBox);
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(
      [...container.querySelectorAll(".loading__w path")].map((path) => path.getAttribute("d")),
    ).toEqual(SYMBOL.letters.map((shape) => shape.d));
    expect(
      [...container.querySelectorAll(".loading__pin path")].map((path) => path.getAttribute("d")),
    ).toEqual(SYMBOL.pin.map((shape) => shape.d));
  });

  it("keeps the ring's hole a hole", () => {
    const { container } = render(<Loading label="Finding that box" />);
    const [ring] = container.querySelectorAll(".loading__pin path");

    expect(ring?.getAttribute("fill-rule")).toBe("evenodd");
  });

  it("drops the pin on the shared clock, round and round", () => {
    const pin = drawn(MARKUP, ".loading__pin", { sheets: [LOADING] });

    expect(pin.animationName).toBe("pin-drop");
    expect(pin.animationDuration).toBe("var(--pin-drop-duration)");
    expect(pin.animationIterationCount).toBe("infinite");
    expect(TOKENS).toContain(`--pin-drop-duration: ${String(PIN_DROP.durationMs)}ms;`);
  });

  it("leaves the w where it is", () => {
    expect(drawn(MARKUP, ".loading__w", { sheets: [LOADING] }).animationName).not.toBe(
      "pin-drop",
    );
  });

  /** Lime on the dark and ink on the light, never lime on white (ADR 24). */
  it("is drawn in the mark's own colour", () => {
    expect(drawn(MARKUP, ".loading__mark", { sheets: [LOADING] }).color).toBe(
      "var(--color-mark)",
    );
  });

  it("goes still, with the pin in its place, for somebody who asked for less motion", () => {
    const pin = drawn(MARKUP, ".loading__pin", { sheets: [LOADING, stillRulesOf(LOADING)] });

    expect(pin.animationName).toBe("none");
  });
});
