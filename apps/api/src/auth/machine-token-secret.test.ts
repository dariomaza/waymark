import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  MACHINE_TOKEN_PREFIX,
  hashMachineTokenSecret,
  issueMachineTokenSecret,
  looksLikeMachineToken,
} from "./machine-token-secret.js";

describe("machine token secrets", () => {
  describe("issuing one", () => {
    it("never issues the same secret twice", () => {
      const issued = new Set(
        Array.from({ length: 200 }, () => issueMachineTokenSecret().token),
      );

      expect(issued.size).toBe(200);
    });

    it("carries a prefix, so whoever finds it in an env file knows what it is", () => {
      const { token } = issueMachineTokenSecret();

      expect(token.startsWith(MACHINE_TOKEN_PREFIX)).toBe(true);
    });

    it("carries at least 256 bits of randomness after the prefix", () => {
      const { token } = issueMachineTokenSecret();
      const secret = token.slice(MACHINE_TOKEN_PREFIX.length);

      // base64url packs 6 bits per character, so 32 bytes is 43 characters.
      expect(secret.length).toBeGreaterThanOrEqual(43);
      expect(secret).toMatch(/^[A-Za-z0-9_-]+$/u);
    });

    it("hands back the hash that will be stored, and never the other way round", () => {
      const { token, tokenHash } = issueMachineTokenSecret();

      expect(tokenHash).toBe(hashMachineTokenSecret(token));
      expect(tokenHash).not.toContain(token);
      expect(token).not.toContain(tokenHash);
    });
  });

  describe("hashing one", () => {
    it("is SHA-256 of the presented token, so a lookup is one indexed read", () => {
      const token = `${MACHINE_TOKEN_PREFIX}whatever`;

      expect(hashMachineTokenSecret(token)).toBe(
        createHash("sha256").update(token, "utf8").digest("hex"),
      );
    });

    it("answers the same hash for the same token, every time", () => {
      const { token } = issueMachineTokenSecret();

      expect(hashMachineTokenSecret(token)).toBe(hashMachineTokenSecret(token));
    });

    it("answers a different hash for a token that differs by one character", () => {
      const { token } = issueMachineTokenSecret();
      const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

      expect(hashMachineTokenSecret(tampered)).not.toBe(
        hashMachineTokenSecret(token),
      );
    });
  });

  describe("recognising one before any database is touched", () => {
    it("recognises a token this API issued", () => {
      expect(looksLikeMachineToken(issueMachineTokenSecret().token)).toBe(true);
    });

    it("refuses a string with no prefix at all", () => {
      // What a session token looks like: base64url and nothing else.
      expect(looksLikeMachineToken("dGhpcy1pcy1hLXNlc3Npb24tdG9rZW4")).toBe(
        false,
      );
    });

    it("refuses a prefix with nothing behind it", () => {
      expect(looksLikeMachineToken(MACHINE_TOKEN_PREFIX)).toBe(false);
    });

    it("refuses a secret carrying characters base64url never produces", () => {
      expect(looksLikeMachineToken(`${MACHINE_TOKEN_PREFIX}not a secret`)).toBe(
        false,
      );
    });
  });
});
