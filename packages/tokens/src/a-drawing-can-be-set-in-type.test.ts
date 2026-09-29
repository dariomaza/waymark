import { describe, expect, it } from "vitest";

import type { Drawing } from "./mark.js";
import { inQuadrants, rasterise } from "./raster.js";

/**
 * # The rasteriser the console's mark is checked against
 *
 * The signature in the browser console draws the mark in text, and a test
 * holds that text to what this produces from the real outlines. So this has
 * to be right about the three things the mark is made of: filled areas, a
 * hole inside a ring, and outlines that overlap.
 */
const square = (d: string, evenOdd = false): Drawing => ({
  viewBox: "0 0 4 4",
  letters: [{ d, ...(evenOdd ? { evenOdd } : {}) }],
  pin: [],
});

const FULL = "M0 0L4 0L4 4L0 4Z";

describe("setting a drawing in type", () => {
  it("fills every cell a filled shape covers", () => {
    expect(rasterise(square(FULL), 4, 4).flat().every(Boolean)).toBe(true);
  });

  it("leaves a ring's hole empty where the shape says it is a hole", () => {
    const ring = square(`${FULL}M1 1L3 1L3 3L1 3Z`, true);

    expect(rasterise(ring, 4, 4).map((row) => row.map((on) => (on ? 1 : 0)))).toEqual([
      [1, 1, 1, 1],
      [1, 0, 0, 1],
      [1, 0, 0, 1],
      [1, 1, 1, 1],
    ]);
  });

  it("joins outlines that overlap rather than cancelling them", () => {
    const overlapping = square("M0 0L3 0L3 4L0 4ZM1 0L4 0L4 4L1 4Z");

    expect(rasterise(overlapping, 4, 4).flat().every(Boolean)).toBe(true);
  });

  it("puts four cells in each character, and trims what is blank around them", () => {
    const corner = square("M0 0L2 0L2 2L0 2Z");

    expect(inQuadrants(rasterise(corner, 4, 4))).toEqual(["█"]);
    expect(inQuadrants([[false, true], [true, false]])).toEqual(["▞"]);
    expect(inQuadrants([[true, true], [false, false]])).toEqual(["▀"]);
    expect(inQuadrants([[true, false], [false, false]])).toEqual(["▘"]);
    expect(inQuadrants([[false, true], [false, false]])).toEqual(["▝"]);
    expect(inQuadrants([[false, false], [false, true]])).toEqual(["▗"]);
  });

  it("drops the margin every line shares, and keeps what differs between them", () => {
    const far = square("M2 2L4 2L4 4L2 4Z");

    expect(inQuadrants(rasterise(far, 4, 4))).toEqual(["█"]);
    expect(
      inQuadrants([
        [false, false, true, true],
        [false, false, true, true],
        [false, false, false, false],
        [false, false, false, false],
        [false, false, false, false],
        [false, false, false, false],
        [true, true, false, false],
        [true, true, false, false],
      ]),
    ).toEqual([" █", "", "", "█"]);
  });
});
