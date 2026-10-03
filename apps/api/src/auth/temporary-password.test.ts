import { describe, expect, it } from "vitest";

import { MINIMUM_PASSWORD_LENGTH } from "./create-user.js";
import {
  TEMPORARY_PASSWORD_ALPHABET,
  TEMPORARY_PASSWORD_ENTROPY_BITS,
  generateTemporaryPassword,
} from "./temporary-password.js";

/**
 * # The password an administrator reads out to a new person (ADR 26, amended)
 *
 * Typed once, on a phone, by somebody who has never seen the app: lower case,
 * no character that reads as another, in groups a person can keep their place
 * in. And still too many possibilities to guess in the time it lives.
 */
describe("a temporary password", () => {
  const SAMPLES = Array.from({ length: 300 }, () => generateTemporaryPassword());

  it("is four groups of four lower-case letters, joined by hyphens", () => {
    for (const password of SAMPLES) {
      expect(password).toMatch(/^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/u);
    }
  });

  it("never uses a character that reads as another: no 0/o, no 1/l/i", () => {
    for (const ambiguous of ["0", "o", "1", "l", "i"]) {
      expect(TEMPORARY_PASSWORD_ALPHABET).not.toContain(ambiguous);
      expect(SAMPLES.join("")).not.toContain(ambiguous);
    }
  });

  /**
   * Whatever the alphabet says, it is the characters that come out that are
   * the entropy. A generator that quietly used fewer would pass a check of
   * the constant and fail this one.
   */
  it("draws on every letter of its alphabet", () => {
    const seen = new Set(SAMPLES.join("").replaceAll("-", ""));

    expect([...seen].sort()).toEqual([...TEMPORARY_PASSWORD_ALPHABET].sort());
  });

  it("has at least 64 bits of entropy: 16 draws from 23 letters, 72.4 bits", () => {
    expect(TEMPORARY_PASSWORD_ALPHABET).toHaveLength(23);
    expect(TEMPORARY_PASSWORD_ENTROPY_BITS).toBeCloseTo(16 * Math.log2(23), 5);
    expect(TEMPORARY_PASSWORD_ENTROPY_BITS).toBeCloseTo(72.38, 2);
    expect(TEMPORARY_PASSWORD_ENTROPY_BITS).toBeGreaterThanOrEqual(64);
  });

  it("is never the same twice", () => {
    expect(new Set(SAMPLES).size).toBe(SAMPLES.length);
  });

  it("is long enough to be a password here at all", () => {
    expect(SAMPLES[0]?.length).toBeGreaterThanOrEqual(MINIMUM_PASSWORD_LENGTH);
  });
});
