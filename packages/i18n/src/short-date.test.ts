import { describe, expect, it } from "vitest";

import { shortDate } from "./short-date.js";

/**
 * # A date in a row of the account screen, in as few characters as are true
 *
 * "Last used 20 Sept 2026" wrapped onto a second line on a phone, for a year
 * everybody reading it already knows. The year is said only when it is not
 * this one.
 */
const NOW = new Date("2026-09-29T12:00:00.000Z");

describe("a short date", () => {
  it("leaves out the year when it is this year", () => {
    expect(shortDate("2026-09-20T10:00:00.000Z", "en", NOW)).not.toContain("2026");
    expect(shortDate("2026-09-20T10:00:00.000Z", "es", NOW)).not.toContain("2026");
  });

  it("says the year when it is another one", () => {
    expect(shortDate("2025-12-20T10:00:00.000Z", "en", NOW)).toContain("2025");
  });

  it("says the day and the month in the language on screen", () => {
    expect(shortDate("2026-09-20T10:00:00.000Z", "en", NOW)).toMatch(/20/);
    expect(shortDate("2026-09-20T10:00:00.000Z", "en", NOW)).toMatch(/sep/i);
    expect(shortDate("2026-09-20T10:00:00.000Z", "es", NOW)).toMatch(/sept/i);
  });
});
