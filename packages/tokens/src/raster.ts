import type { Drawing, Shape } from "./mark.js";

/**
 * # A drawing, as a grid of on and off
 *
 * For the one place the mark has to be drawn in TEXT: the browser console,
 * where the web client signs itself (`console-signature.ts`). The picture
 * there is committed as a constant, and a test recomputes it from these
 * outlines through this function, so it is the mark rasterised — not a
 * drawing of the mark somebody made by eye.
 *
 * Every outline is walked into polygons (arcs and quadratics sampled
 * finely), and each cell is the share of its area inside the drawing,
 * sampled on a small grid of its own. A shape marked `evenOdd` has holes
 * where its contours nest — the pin's ring — and the others are the union of
 * their contours, which is what the letters' overlapping strokes mean.
 */
type Point = readonly [number, number];

const polygonsOf = (d: string): Point[][] => {
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
      for (let step = 1; step <= 12; step++) {
        const u = step / 12;
        points.push([
          (1 - u) ** 2 * at[0] + 2 * (1 - u) * u * control[0] + u * u * end[0],
          (1 - u) ** 2 * at[1] + 2 * (1 - u) * u * control[1] + u * u * end[1],
        ]);
      }
      at = end;
    } else if (command === "A") {
      const radius = next();
      i += 2;
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
      for (let step = 1; step <= 16; step++) {
        const angle = from + ((to - from) * step) / 16;
        points.push([centre[0] + radius * Math.cos(angle), centre[1] + radius * Math.sin(angle)]);
      }
      at = end;
    }
  }

  return contours;
};

/** Ray casting: whether `point` is inside one closed polygon. */
const inside = ([x, y]: Point, polygon: readonly Point[]): boolean => {
  let crossings = 0;

  for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a++) {
    const [xa, ya] = polygon[a] ?? [0, 0];
    const [xb, yb] = polygon[b] ?? [0, 0];

    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) {
      crossings++;
    }
  }

  return crossings % 2 === 1;
};

const covers = (shape: Shape, polygons: readonly Point[][], point: Point): boolean => {
  const hits = polygons.filter((polygon) => inside(point, polygon)).length;

  return shape.evenOdd === true ? hits % 2 === 1 : hits > 0;
};

/**
 * `columns` by `rows` cells over the drawing's view box, each on when at least
 * `threshold` of it is covered.
 */
export const rasterise = (
  drawing: Drawing,
  columns: number,
  rows: number,
  threshold = 0.5,
): boolean[][] => {
  const [left = 0, top = 0, width = 1, height = 1] = drawing.viewBox.split(" ").map(Number);
  const shapes = [...drawing.letters, ...drawing.pin].map(
    (shape) => [shape, polygonsOf(shape.d)] as const,
  );
  const SAMPLES = 5;

  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      let hits = 0;

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const point: Point = [
            left + ((column + (sx + 0.5) / SAMPLES) * width) / columns,
            top + ((row + (sy + 0.5) / SAMPLES) * height) / rows,
          ];

          if (shapes.some(([shape, polygons]) => covers(shape, polygons, point))) {
            hits++;
          }
        }
      }

      return hits / SAMPLES ** 2 >= threshold;
    }),
  );
};

/**
 * Four cells to a character, with the Unicode quadrant blocks: two across and
 * two down, which is roughly square in a monospaced font whose characters are
 * twice as tall as they are wide. Blank lines above and below, the margin on
 * the left that every line shares, and trailing spaces are trimmed away.
 */
const QUADRANTS = [" ", "▘", "▝", "▀", "▖", "▌", "▞", "▛", "▗", "▚", "▐", "▜", "▄", "▙", "▟", "█"];

export const inQuadrants = (grid: readonly (readonly boolean[])[]): string[] => {
  const lines: string[] = [];

  for (let row = 0; row < grid.length; row += 2) {
    let line = "";
    const width = grid[0]?.length ?? 0;

    for (let column = 0; column < width; column += 2) {
      const at = (r: number, c: number): number => (grid[r]?.[c] === true ? 1 : 0);
      line +=
        QUADRANTS[
          at(row, column) + 2 * at(row, column + 1) + 4 * at(row + 1, column) + 8 * at(row + 1, column + 1)
        ];
    }

    lines.push(line.replace(/\s+$/u, ""));
  }

  const first = lines.findIndex((line) => line !== "");
  const last = lines.length - 1 - [...lines].reverse().findIndex((line) => line !== "");
  const kept = first === -1 ? [] : lines.slice(first, last + 1);
  const margin = Math.min(
    ...kept.filter((line) => line !== "").map((line) => line.length - line.trimStart().length),
  );

  return kept.map((line) => line.slice(margin));
};
