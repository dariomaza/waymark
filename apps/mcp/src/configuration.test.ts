import { describe, expect, it } from "vitest";

import {
  API_URL_VARIABLE,
  DEFAULT_API_URL,
  MACHINE_TOKEN_VARIABLE,
  readConfiguration,
} from "./configuration.js";

const A_TOKEN = "wmk_hhKABz-fSeDJwWCfiNRkmB9BoSGcv6wrPAhTya7CW28";

describe("reading this server's configuration", () => {
  it("takes the API's address and the machine token from the environment", () => {
    const result = readConfiguration({
      [API_URL_VARIABLE]: "https://waymark.example",
      [MACHINE_TOKEN_VARIABLE]: A_TOKEN,
    });

    expect(result).toEqual({
      ok: true,
      configuration: { baseUrl: "https://waymark.example", token: A_TOKEN },
    });
  });

  it("falls back to the address a local API listens on", () => {
    const result = readConfiguration({ [MACHINE_TOKEN_VARIABLE]: A_TOKEN });

    expect(result.ok && result.configuration.baseUrl).toBe(DEFAULT_API_URL);
  });

  it("takes a trailing slash off, because every path is concatenated onto it", () => {
    const result = readConfiguration({
      [API_URL_VARIABLE]: "https://waymark.example/",
      [MACHINE_TOKEN_VARIABLE]: A_TOKEN,
    });

    expect(result.ok && result.configuration.baseUrl).toBe("https://waymark.example");
  });

  it("refuses to start with no token, and says how to make one", () => {
    const result = readConfiguration({});

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problem).toContain(MACHINE_TOKEN_VARIABLE);
    expect(!result.ok && result.problem).toContain("machine-token create");
  });

  it("treats a variable set to whitespace as not set at all", () => {
    const result = readConfiguration({ [MACHINE_TOKEN_VARIABLE]: "   " });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problem).toContain("machine-token create");
  });

  it("tells a session token pasted into the variable apart from a missing one", () => {
    const result = readConfiguration({
      [MACHINE_TOKEN_VARIABLE]: "3f8a0c1d4e5b6a7c8d9e0f1a2b3c4d5e",
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problem).toContain("wmk_");
    expect(!result.ok && result.problem).not.toContain("machine-token create");
  });

  it("refuses an address that is not an http address", () => {
    const result = readConfiguration({
      [API_URL_VARIABLE]: "waymark.example",
      [MACHINE_TOKEN_VARIABLE]: A_TOKEN,
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problem).toContain(API_URL_VARIABLE);
  });

  /**
   * The one thing that must never happen anywhere in this package. A refusal
   * about a token is written from the VARIABLE's name, never from its value.
   */
  it("never repeats the token back in a refusal", () => {
    const mangled = `${A_TOKEN}"`;
    const result = readConfiguration({ [MACHINE_TOKEN_VARIABLE]: mangled });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problem).not.toContain(A_TOKEN.slice(4, 20));
  });
});
