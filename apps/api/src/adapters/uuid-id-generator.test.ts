import { describe, expect, it } from "vitest";

import { UuidIdGenerator } from "./uuid-id-generator.js";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe("UuidIdGenerator", () => {
  it("produces a v4 UUID", () => {
    expect(new UuidIdGenerator().next()).toMatch(UUID_V4);
  });

  it("never repeats itself", () => {
    const generator = new UuidIdGenerator();

    const issued = new Set(
      Array.from({ length: 10_000 }, () => generator.next()),
    );

    expect(issued.size).toBe(10_000);
  });
});
