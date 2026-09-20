import { describe, expect, it } from "vitest";

import {
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
  Base32PublicIdGenerator,
} from "./public-id-generator.js";

describe("Base32PublicIdGenerator", () => {
  const generator = new Base32PublicIdGenerator();

  it("is short enough to sit comfortably inside a printed QR code", () => {
    expect(PUBLIC_ID_LENGTH).toBe(10);
    expect(generator.next()).toHaveLength(PUBLIC_ID_LENGTH);
  });

  it("uses a 32 character alphabet with no repeated symbol", () => {
    expect(PUBLIC_ID_ALPHABET).toHaveLength(32);
    expect(new Set(PUBLIC_ID_ALPHABET).size).toBe(32);
  });

  it("omits the characters people confuse when reading an id aloud", () => {
    // I/1, L/1, O/0 and U/V are the classic misreads; Crockford drops them.
    for (const confusing of ["I", "L", "O", "U"]) {
      expect(PUBLIC_ID_ALPHABET).not.toContain(confusing);
    }
  });

  it("is URL safe: no character needs percent encoding", () => {
    const id = generator.next();

    expect(encodeURIComponent(id)).toBe(id);
  });

  it("is upper case only, so QR alphanumeric mode stays available", () => {
    expect(PUBLIC_ID_ALPHABET).toBe(PUBLIC_ID_ALPHABET.toUpperCase());
    expect(generator.next()).toMatch(/^[0-9A-Z]+$/u);
  });

  it("only ever emits characters from its own alphabet", () => {
    const allowed = new Set(PUBLIC_ID_ALPHABET);

    for (let attempt = 0; attempt < 2_000; attempt += 1) {
      for (const character of generator.next()) {
        expect(allowed.has(character)).toBe(true);
      }
    }
  });

  it("does not collide across a homelab's worth of storage units", () => {
    const issued = new Set(
      Array.from({ length: 50_000 }, () => generator.next()),
    );

    expect(issued.size).toBe(50_000);
  });

  it("spreads values across the whole alphabet rather than a biased slice", () => {
    const seen = new Set<string>();

    for (let attempt = 0; attempt < 5_000; attempt += 1) {
      for (const character of generator.next()) {
        seen.add(character);
      }
    }

    expect(seen.size).toBe(PUBLIC_ID_ALPHABET.length);
  });
});
