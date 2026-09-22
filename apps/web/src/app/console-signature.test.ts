import { describe, expect, it, vi } from "vitest";

import { printConsoleSignature } from "./console-signature.js";

describe("the greeting in the developer console", () => {
  it("says what this is and where the source is", () => {
    const log = vi.fn();
    printConsoleSignature({ log, styled: false });

    const [message] = log.mock.calls[0] ?? [];
    expect(message).toContain("Waymark");
    expect(message).toContain("Find your way back.");
    expect(message).toContain("github.com/dariomaza/waymark");
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
    const log = vi.fn();
    printConsoleSignature({ log, styled: true });

    const call = log.mock.calls[0] ?? [];
    expect(String(call[0])).toContain("%c");
    expect(call.join(" ")).toContain("Waymark");
    expect(call.join(" ")).toContain("github.com/dariomaza/waymark");
    // The accent, and only the accent: the greeting is not a second palette.
    expect(call.join(" ")).toContain("#c8f04a");
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
