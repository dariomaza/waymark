import { describe, expect, it } from "vitest";

import {
  SESSION_TOKEN_BYTES,
  hashSessionToken,
  issueSessionToken,
} from "./session-token.js";

describe("session tokens", () => {
  it("carries 256 bits of entropy, so it cannot be guessed", () => {
    expect(SESSION_TOKEN_BYTES).toBe(32);
  });

  it("is URL and header safe, so it survives an Authorization header untouched", () => {
    const { token } = issueSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(encodeURIComponent(token)).toBe(token);
  });

  it("never repeats", () => {
    const issued = new Set(
      Array.from({ length: 10_000 }, () => issueSessionToken().token),
    );

    expect(issued.size).toBe(10_000);
  });

  it("hands out a hash next to the token, so the token itself is never stored", () => {
    const { token, tokenHash } = issueSessionToken();

    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toBe(hashSessionToken(token));
  });

  it("hashes deterministically, so a presented token can be looked up", () => {
    expect(hashSessionToken("a-token")).toBe(hashSessionToken("a-token"));
    expect(hashSessionToken("a-token")).not.toBe(hashSessionToken("b-token"));
  });

  it("produces a fixed width hex digest", () => {
    expect(hashSessionToken(issueSessionToken().token)).toMatch(/^[0-9a-f]{64}$/u);
  });
});
