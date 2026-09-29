import { describe, expect, it } from "vitest";

import { cssText } from "./css.js";
import { LOGO, SYMBOL, shapesOf } from "./mark.js";
import { PIN_DROP } from "./motion.js";

/**
 * # The symbol the wait is drawn from, and how its pin moves
 *
 * The owner: the loading animation is why the logo was made. The w stays put
 * and the pin drops onto it and settles — the "found it" moment — then lifts
 * and does it again. Both clients draw it from these numbers, so the two
 * waits are the same shape moving on the same clock.
 */
describe("the symbol: the w and the full pin", () => {
  /** Not a redrawing: the logo's own w and the logo's own pin, the same objects. */
  it("is exactly the approved mark's w and pin, and nothing else", () => {
    expect(SYMBOL.letters).toHaveLength(1);
    expect(SYMBOL.letters[0]).toBe(LOGO.letters[0]);
    expect(SYMBOL.pin).toBe(LOGO.pin);
    expect(shapesOf(SYMBOL)).toEqual([LOGO.letters[0], ...LOGO.pin]);
  });

  it("is framed in the logo's own units, from the pin's top to the baseline", () => {
    const [x, y, width, height] = SYMBOL.viewBox.split(" ").map(Number);

    expect([x, y]).toEqual([20, -1033]);
    expect(y! + height!).toBe(0);
    expect(x! + width!).toBeGreaterThanOrEqual(990.94);
  });
});

describe("the pin, while something is on its way", () => {
  const ys = PIN_DROP.steps.map((step) => step.y);

  it("goes round in the time it takes to notice it, not to wait for it", () => {
    expect(PIN_DROP.durationMs).toBeGreaterThanOrEqual(1200);
    expect(PIN_DROP.durationMs).toBeLessThanOrEqual(1600);
  });

  it("starts lifted and ends where it started, so the loop has no seam", () => {
    expect(PIN_DROP.steps[0]?.at).toBe(0);
    expect(PIN_DROP.steps.at(-1)?.at).toBe(1);
    expect(ys[0]).toBeLessThan(0);
    expect(ys.at(-1)).toBe(ys[0]);
  });

  it("moves forward through the loop, one step after another", () => {
    const ats = PIN_DROP.steps.map((step) => step.at);

    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
    expect(new Set(ats).size).toBe(ats.length);
  });

  /**
   * The settle: past its resting place and back, a little. Downwards is
   * towards the w, and the pin's tip is 28.68 units above the w's right arm,
   * so the overshoot must stay inside that gap — the pin lands ON the w's
   * idea, never through its letter.
   */
  it("drops a little past its rest and settles, without touching the w", () => {
    const deepest = Math.max(...ys);

    expect(deepest).toBeGreaterThan(0);
    expect(deepest).toBeLessThan(28.68);
  });

  it("pauses at rest, in the place the approved mark draws it", () => {
    const resting = PIN_DROP.steps.filter((step) => step.y === 0);

    expect(resting.length).toBeGreaterThanOrEqual(2);
    expect(resting.at(-1)!.at - resting[0]!.at).toBeGreaterThanOrEqual(0.2);
  });

  /** A falling thing speeds up, a landing thing slows down: no step is linear. */
  it("eases every step, and none of them is linear", () => {
    for (const step of PIN_DROP.steps.slice(0, -1)) {
      const [x1, y1, x2, y2] = step.ease;

      expect([x1, y1]).not.toEqual([x2, y2]);
      expect(x1 === y1 && x2 === y2).toBe(false);
    }
  });
});

/**
 * # The browser's copy of the clock is generated, not written
 *
 * CSS cannot import these steps, so the stylesheet is handed them the way it
 * is handed the palette: rendered into `tokens.css`, which a web test checks
 * byte for byte.
 */
describe("the keyframes the browser is handed", () => {
  const CSS = cssText();
  const frames = /@keyframes pin-drop \{([\s\S]*?)\n\}/u.exec(CSS)?.[1] ?? "";

  it("has one keyframe per step, at the same moments", () => {
    const moments = [...frames.matchAll(/^ {2}([\d.]+)% \{/gmu)].map(([, at]) => Number(at) / 100);

    expect(moments).toEqual(PIN_DROP.steps.map((step) => step.at));
  });

  it("moves the pin by the same amounts, in the symbol's units", () => {
    const offsets = [...frames.matchAll(/translateY\((-?[\d.]+)px\)/gu)].map(([, y]) => Number(y));

    expect(offsets).toEqual(PIN_DROP.steps.map((step) => step.y));
  });

  it("eases each stretch the same way", () => {
    const curves = [...frames.matchAll(/cubic-bezier\(([^)]*)\)/gu)].map(([, curve]) =>
      String(curve).split(", ").map(Number),
    );

    expect(curves).toEqual(PIN_DROP.steps.slice(0, -1).map((step) => [...step.ease]));
  });

  it("states how long one loop takes", () => {
    expect(CSS).toContain(`--pin-drop-duration: ${String(PIN_DROP.durationMs)}ms;`);
  });
});
