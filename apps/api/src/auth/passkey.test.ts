import { describe, expect, it } from "vitest";

import {
  isUsablePasskeyLabel,
  normalizePasskeyLabel,
  PASSKEY_LABEL_MAX_LENGTH,
  signalsAClonedAuthenticator,
} from "./passkey.js";

describe("what a person calls one of their devices", () => {
  it("keeps the case they typed, because it is a name and not an identifier", () => {
    expect(normalizePasskeyLabel("Pixel 8")).toBe("Pixel 8");
  });

  it("trims the spaces a phone keyboard adds at the end", () => {
    expect(normalizePasskeyLabel("  Work laptop  ")).toBe("Work laptop");
  });

  it("refuses a label that is only whitespace", () => {
    expect(isUsablePasskeyLabel("   ")).toBe(false);
  });

  it("refuses an empty one", () => {
    expect(isUsablePasskeyLabel("")).toBe(false);
  });

  it("accepts an ordinary one", () => {
    expect(isUsablePasskeyLabel("Pixel 8")).toBe(true);
  });

  it("accepts accents and emoji, because this is a name a person reads", () => {
    expect(isUsablePasskeyLabel("Móvil de Darío 📱")).toBe(true);
  });

  it("refuses one longer than a row can show", () => {
    expect(isUsablePasskeyLabel("x".repeat(PASSKEY_LABEL_MAX_LENGTH + 1))).toBe(
      false,
    );
  });

  it("accepts one exactly at the limit", () => {
    expect(isUsablePasskeyLabel("x".repeat(PASSKEY_LABEL_MAX_LENGTH))).toBe(true);
  });

  it("measures the trimmed label, not the spaces around it", () => {
    const padded = `  ${"x".repeat(PASSKEY_LABEL_MAX_LENGTH)}  `;

    expect(isUsablePasskeyLabel(padded)).toBe(true);
  });
});

/**
 * # The counter, and the authenticators that do not keep one
 *
 * The rule has to hold for both populations at once: a security key that
 * counts every signature, and a phone whose passkey is synced across three
 * devices and therefore always reports zero. Treating zero as a regression
 * would refuse every platform passkey on its second use, which is every
 * passkey this product will actually meet.
 */
describe("a signature counter that says an authenticator was cloned", () => {
  it("says nothing when neither side counts, which is most phones", () => {
    expect(signalsAClonedAuthenticator(0, 0)).toBe(false);
  });

  it("is happy with a count that went up", () => {
    expect(signalsAClonedAuthenticator(41, 42)).toBe(false);
  });

  it("is happy with the first count from an authenticator that does keep one", () => {
    expect(signalsAClonedAuthenticator(0, 1)).toBe(false);
  });

  it("refuses a count that repeated, which is a replay or a copy", () => {
    expect(signalsAClonedAuthenticator(42, 42)).toBe(true);
  });

  it("refuses a count that went backwards", () => {
    expect(signalsAClonedAuthenticator(42, 7)).toBe(true);
  });

  /**
   * An authenticator that counted yesterday and reports zero today has not
   * stopped implementing counters; something else is answering for it.
   */
  it("refuses a zero from a credential that has counted before", () => {
    expect(signalsAClonedAuthenticator(42, 0)).toBe(true);
  });
});
