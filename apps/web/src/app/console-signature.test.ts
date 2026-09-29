import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DARK, inQuadrants, LIGHT, MARK_SMALL, rasterise } from "@waymark/tokens";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MARK_IN_TYPE, printConsoleSignature } from "./console-signature.js";

/** Everything the plain form prints, line by line. */
const plainLines = (): string[] => {
  const log = vi.fn();
  printConsoleSignature({ log, styled: false });

  return String(log.mock.calls[0]?.[0]).split("\n");
};

const styledCall = (): unknown[] => {
  const log = vi.fn();
  printConsoleSignature({ log, styled: true });

  return log.mock.calls[0] ?? [];
};

const deviceIn = (scheme: "light" | "dark"): void => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("light") ? scheme === "light" : scheme === "dark",
  }));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the greeting in the developer console", () => {
  /**
   * Not a drawing somebody made by eye: the small cut of the mark — the w and
   * the solid pin, the one the brand uses at icon size — rasterised from its
   * real outlines, four cells to a character.
   */
  it("draws the mark, rasterised from the mark itself", () => {
    expect(MARK_IN_TYPE).toEqual(inQuadrants(rasterise(MARK_SMALL, 22, 22, 0.4)));
  });

  it("draws the mark in the plain form too, with the words beside it", () => {
    const lines = plainLines();

    for (const row of MARK_IN_TYPE) {
      expect(lines.some((line) => line.startsWith(row))).toBe(true);
    }
  });

  it("says what this is and where the source is", () => {
    const message = plainLines().join("\n");

    expect(message).toContain("Waymark");
    expect(message).toContain("Find your way back.");
    expect(message).toContain("https://github.com/dariomaza/waymark");
  });

  /**
   * The owner asked for something richer than a line of text, and a docked
   * devtools panel is narrow: past about 48 columns a line wraps and the
   * picture falls apart. So it is held to a small box.
   */
  it("fits a docked console: twelve lines at most, forty-eight columns at most", () => {
    const lines = plainLines();

    expect(lines.length).toBeLessThanOrEqual(12);
    for (const line of lines) {
      expect([...line].length).toBeLessThanOrEqual(48);
    }
  });

  /**
   * `%c` is a console convention, not a standard. Where it is not understood
   * the CSS is printed as text, so a greeting becomes gibberish — which is a
   * worse outcome than plain words.
   */
  it("sends no styling instructions to a console that would print them", () => {
    const log = vi.fn();
    printConsoleSignature({ log, styled: false });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]).toHaveLength(1);
    expect(String(log.mock.calls[0]?.[0])).not.toContain("%c");
  });

  it("styles it where that is understood, and still says the same things", () => {
    const [format, ...styles] = styledCall();

    expect(String(format).split("%c").length - 1).toBe(styles.length);
    expect(String(format).replaceAll("%c", "")).toBe(plainLines().join("\n"));
  });

  /**
   * The mark's own colour, from the shared palette: the lime on a dark
   * console and the ink on a light one — never the lime on white (ADR 24).
   * A console's theme follows the device, not the app's own choice.
   */
  it.each([
    ["dark", DARK],
    ["light", LIGHT],
  ] as const)("draws the mark in the mark's colour on a %s console", (scheme, palette) => {
    deviceIn(scheme);

    const styles = styledCall().slice(1).map(String);

    expect(styles[0]).toContain(`color:${palette.mark}`);
    expect(styles.join(" ")).not.toContain(scheme === "light" ? DARK.mark : LIGHT.mark);
  });

  it("writes down no colour of its own", () => {
    const source = readFileSync(join(process.cwd(), "src/app/console-signature.ts"), "utf8");

    expect(source).not.toMatch(/#[\da-f]{3,8}\b/iu);
  });

  /**
   * The property that matters more than any of the copy. Some embedded
   * webviews hand out a `console` whose methods throw, and a greeting is
   * never worth a blank screen.
   */
  it("never lets a broken console take the app down with it", () => {
    const log = vi.fn(() => {
      throw new Error("this console refuses to log");
    });

    expect(() => {
      printConsoleSignature({ log, styled: true });
    }).not.toThrow();
  });
});
