import { describe, expect, it } from "vitest";

import { LOGO, MARK_SMALL, SYMBOL, shapesOf, type Drawing, type Shape } from "./mark.js";

/**
 * # The mark, as arithmetic that has to keep holding
 *
 * The drawings are not asserted path by path — a test that repeats a `d`
 * attribute only proves the file was copied. What is asserted is what makes
 * them the mark: that each fits the box it is handed in, that the pin points
 * down at the w, and that the small cut is the one with the solid pin.
 *
 * The outlines are walked rather than their numbers read, because the pin's
 * corners are arcs and an arc's furthest point is not one of its endpoints:
 * the pin is a square turned 45°, so its top is the MIDDLE of a rounded corner.
 */
type Point = readonly [number, number];

/** Every point along a path's outline, arcs and quadratics sampled finely. */
const outline = (d: string): Point[][] => {
  const tokens = d.match(/[MLQAZ]|-?\d*\.?\d+/gu) ?? [];
  const contours: Point[][] = [];
  let points: Point[] = [];
  let at: Point = [0, 0];
  let i = 0;
  const next = (): number => Number(tokens[i++]);

  while (i < tokens.length) {
    const command = tokens[i++];

    if (command === "M") {
      points = [];
      contours.push(points);
      at = [next(), next()];
      points.push(at);
    } else if (command === "L") {
      at = [next(), next()];
      points.push(at);
    } else if (command === "Q") {
      const control: Point = [next(), next()];
      const end: Point = [next(), next()];
      for (let step = 1; step <= 16; step++) {
        const u = step / 16;
        points.push([
          (1 - u) ** 2 * at[0] + 2 * (1 - u) * u * control[0] + u * u * end[0],
          (1 - u) ** 2 * at[1] + 2 * (1 - u) * u * control[1] + u * u * end[1],
        ]);
      }
      at = end;
    } else if (command === "A") {
      const radius = next();
      i += 2; // the second radius, which is the same, and the rotation, which a circle ignores
      const large = next();
      const sweep = next();
      const end: Point = [next(), next()];
      const [dx, dy] = [end[0] - at[0], end[1] - at[1]];
      const chord = Math.hypot(dx, dy);
      const rise = Math.sqrt(Math.max(0, radius ** 2 - (chord / 2) ** 2));
      const side = sweep === large ? -1 : 1;
      const centre: Point = [
        (at[0] + end[0]) / 2 - (side * rise * dy) / chord,
        (at[1] + end[1]) / 2 + (side * rise * dx) / chord,
      ];
      const from = Math.atan2(at[1] - centre[1], at[0] - centre[0]);
      let to = Math.atan2(end[1] - centre[1], end[0] - centre[0]);
      if (sweep === 1) {
        while (to < from) to += 2 * Math.PI;
      } else {
        while (to > from) to -= 2 * Math.PI;
      }
      for (let step = 1; step <= 32; step++) {
        const angle = from + ((to - from) * step) / 32;
        points.push([centre[0] + radius * Math.cos(angle), centre[1] + radius * Math.sin(angle)]);
      }
      at = end;
    } else if (command !== "Z") {
      throw new Error(`a command this outline does not draw with: ${String(command)}`);
    }
  }

  return contours;
};

const pointsOf = (shapes: readonly Shape[]): Point[] =>
  shapes.flatMap((shape) => outline(shape.d).flat());

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const boxOf = (points: readonly Point[]): Box => ({
  left: Math.min(...points.map(([x]) => x)),
  top: Math.min(...points.map(([, y]) => y)),
  right: Math.max(...points.map(([x]) => x)),
  bottom: Math.max(...points.map(([, y]) => y)),
});

const viewBoxOf = (drawing: Drawing): Box => {
  const [x, y, width, height] = drawing.viewBox.split(" ").map(Number) as [
    number,
    number,
    number,
    number,
  ];

  return { left: x, top: y, right: x + width, bottom: y + height };
};

describe("the mark, at icon size", () => {
  /**
   * The same 24-unit box every lucide shape is drawn in, and inside the same
   * two-unit margin they keep, so the mark beside a tab icon is not the one
   * that looks bigger.
   */
  it("fits the icon box, inside the margin the rest of the set keeps", () => {
    expect(MARK_SMALL.viewBox).toBe("0 0 24 24");

    const drawn = boxOf(pointsOf(shapesOf(MARK_SMALL)));

    expect(drawn.left).toBeGreaterThanOrEqual(2 - 0.001);
    expect(drawn.top).toBeGreaterThanOrEqual(2 - 0.001);
    expect(drawn.right).toBeLessThanOrEqual(22 + 0.001);
    expect(drawn.bottom).toBeLessThanOrEqual(22 + 0.001);
  });

  /**
   * The small cut. At 24 pixels the ring's hole is under a pixel and the core
   * inside it is two, so the full pin closes up into a smudge; this one is a
   * single solid outline and reads as a pin at any size.
   */
  it("draws the pin solid, with no hole in it", () => {
    expect(MARK_SMALL.pin).toHaveLength(1);
    expect(outline(MARK_SMALL.pin[0]?.d ?? "")).toHaveLength(1);
    expect(MARK_SMALL.pin[0]?.evenOdd).not.toBe(true);
  });
});

describe("the symbol, the w with the full pin", () => {
  it("fits the w and the pin inside its own box", () => {
    const frame = viewBoxOf(SYMBOL);
    const drawn = boxOf(pointsOf(shapesOf(SYMBOL)));

    expect(drawn.left).toBeGreaterThanOrEqual(frame.left);
    expect(drawn.top).toBeGreaterThanOrEqual(frame.top);
    expect(drawn.right).toBeLessThanOrEqual(frame.right);
    expect(drawn.bottom).toBeLessThanOrEqual(frame.bottom);
  });
});

describe("the logo, the name with the pin over its w", () => {
  /**
   * The kit this was taken from framed the logo 21 units short at the bottom,
   * so the tail of the y was cut off flat by its own box. Every point of the
   * name and the pin is inside this one.
   */
  it("fits every letter and the pin inside its own box", () => {
    const frame = viewBoxOf(LOGO);
    const drawn = boxOf(pointsOf(shapesOf(LOGO)));

    expect(drawn.left).toBeGreaterThanOrEqual(frame.left);
    expect(drawn.top).toBeGreaterThanOrEqual(frame.top);
    expect(drawn.right).toBeLessThanOrEqual(frame.right);
    expect(drawn.bottom).toBeLessThanOrEqual(frame.bottom);
  });

  it("states its proportions as the numbers its box is made of", () => {
    const frame = viewBoxOf(LOGO);

    expect(LOGO.width).toBe(frame.right - frame.left);
    expect(LOGO.height).toBe(frame.bottom - frame.top);
  });

  /**
   * The full cut: a ring with a core inside it — the finder square of a QR
   * code. The hole has to be a HOLE, not a patch of background colour, or it
   * stops matching the day the surface behind it changes.
   */
  it("draws the pin as a ring with a core in it", () => {
    const [ring, core] = LOGO.pin;

    expect(LOGO.pin).toHaveLength(2);
    expect(ring?.evenOdd).toBe(true);
    expect(outline(ring?.d ?? "")).toHaveLength(2);
    expect(outline(core?.d ?? "")).toHaveLength(1);
  });
});

describe.each([
  ["the mark", MARK_SMALL, 0],
  ["the logo", LOGO, 0],
  ["the symbol", SYMBOL, 0],
] as const)("the pin in %s", (_, drawing, wIndex) => {
  /**
   * The whole idea, in geometry: the label on the box is the place you are
   * looking for, so the pin's point is ABOVE the w, not in it, and over the
   * w's right arm rather than floating beside the word.
   */
  it("points down at the w, from above its right arm", () => {
    const pin = pointsOf(drawing.pin);
    const w = boxOf(outline(drawing.letters[wIndex]?.d ?? "").flat());
    const lowest = pin.reduce((low, point) => (point[1] > low[1] ? point : low));

    expect(lowest[1]).toBeLessThan(w.top);
    expect(lowest[0]).toBeGreaterThan((w.left + w.right) / 2);
    expect(lowest[0]).toBeLessThan(w.right);

    // A point, not an edge: nothing else on the pin is as low as its tip.
    const alsoLowest = pin.filter(([, y]) => Math.abs(y - lowest[1]) < 1e-6);
    expect(new Set(alsoLowest.map(([x]) => x.toFixed(3))).size).toBe(1);
  });
});
