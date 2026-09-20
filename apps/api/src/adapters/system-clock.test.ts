import { describe, expect, it } from "vitest";

import { SystemClock } from "./system-clock.js";

describe("SystemClock", () => {
  it("reports the current wall clock time", () => {
    const before = Date.now();

    const now = new SystemClock().now();

    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("hands out a fresh Date every call, so callers cannot mutate time", () => {
    const clock = new SystemClock();

    const first = clock.now();
    const second = clock.now();
    first.setFullYear(1999);

    expect(second.getFullYear()).not.toBe(1999);
  });
});
