import { describe, expect, it } from "vitest";

import { looksLikeMachineToken, MACHINE_TOKEN_PREFIX } from "./machine-token.js";

describe("what a machine token looks like", () => {
  it("accepts one shaped the way the API issues them", () => {
    expect(
      looksLikeMachineToken(`${MACHINE_TOKEN_PREFIX}hhKABz-fSeDJwWCfiNRkmB9BoSGcv6wrPAhTya7CW28`),
    ).toBe(true);
  });

  it("refuses a session token pasted into the machine token variable", () => {
    expect(looksLikeMachineToken("3f8a0c1d4e5b6a7c8d9e0f1a2b3c4d5e")).toBe(false);
  });

  it("refuses the prefix on its own, and an empty string", () => {
    expect(looksLikeMachineToken(MACHINE_TOKEN_PREFIX)).toBe(false);
    expect(looksLikeMachineToken("")).toBe(false);
  });

  it("refuses one that was mangled on the way into an environment file", () => {
    expect(looksLikeMachineToken(`${MACHINE_TOKEN_PREFIX}has spaces`)).toBe(false);
    expect(looksLikeMachineToken(`${MACHINE_TOKEN_PREFIX}quoted"`)).toBe(false);
  });
});
