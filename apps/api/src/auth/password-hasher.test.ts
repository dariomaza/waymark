import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCRYPT_PARAMETERS,
  MalformedPasswordHash,
  ScryptPasswordHasher,
} from "./password-hasher.js";

/**
 * Cheap parameters, used everywhere the test is about BEHAVIOUR rather than
 * cost. The production parameters are asserted separately, once.
 */
const CHEAP = {
  cost: 1024,
  blockSize: 8,
  parallelism: 1,
  keyLength: 32,
  saltLength: 16,
} as const;

describe("ScryptPasswordHasher", () => {
  const hasher = new ScryptPasswordHasher(CHEAP);

  describe("default parameters", () => {
    it("meets the OWASP scrypt minimum of N=2^16, r=8, p=2", () => {
      expect(DEFAULT_SCRYPT_PARAMETERS.cost).toBe(65_536);
      expect(DEFAULT_SCRYPT_PARAMETERS.blockSize).toBe(8);
      expect(DEFAULT_SCRYPT_PARAMETERS.parallelism).toBe(2);
    });

    it("costs at least 64 MiB of memory per hash, which is what makes it hard", () => {
      const bytes =
        128 *
        DEFAULT_SCRYPT_PARAMETERS.cost *
        DEFAULT_SCRYPT_PARAMETERS.blockSize;

      expect(bytes).toBeGreaterThanOrEqual(64 * 1024 * 1024);
    });

    it("derives a 256 bit key from a 128 bit salt", () => {
      expect(DEFAULT_SCRYPT_PARAMETERS.keyLength).toBe(32);
      expect(DEFAULT_SCRYPT_PARAMETERS.saltLength).toBe(16);
    });
  });

  describe("hash", () => {
    it("accepts the password it just hashed", async () => {
      const encoded = await hasher.hash("correct horse battery staple");

      await expect(hasher.verify("correct horse battery staple", encoded)).resolves.toBe(true);
    });

    it("rejects any other password", async () => {
      const encoded = await hasher.hash("correct horse battery staple");

      await expect(hasher.verify("correct horse battery stapler", encoded)).resolves.toBe(false);
    });

    it("salts every hash, so two identical passwords never share a digest", async () => {
      const [first, second] = await Promise.all([
        hasher.hash("same password"),
        hasher.hash("same password"),
      ]);

      expect(first).not.toBe(second);
    });

    it("never stores the password itself", async () => {
      const encoded = await hasher.hash("a-very-distinctive-password");

      expect(encoded).not.toContain("a-very-distinctive-password");
    });

    it("records the parameters it used, so they can be raised later without locking anyone out", async () => {
      const encoded = await hasher.hash("whatever");

      expect(encoded.startsWith(`scrypt$N=${CHEAP.cost},r=8,p=1$`)).toBe(true);
    });

    it("verifies a hash produced with different parameters than the current default", async () => {
      const older = new ScryptPasswordHasher({ ...CHEAP, cost: 512 });
      const encoded = await older.hash("legacy password");

      // The verifying hasher is configured with N=1024, the stored hash with 512.
      await expect(hasher.verify("legacy password", encoded)).resolves.toBe(true);
    });

    it("handles non-ASCII passwords byte for byte", async () => {
      const encoded = await hasher.hash("contraseña con ñ y emoji 🔐");

      await expect(hasher.verify("contraseña con ñ y emoji 🔐", encoded)).resolves.toBe(true);
      await expect(hasher.verify("contrasena con n y emoji 🔐", encoded)).resolves.toBe(false);
    });
  });

  describe("verify on a corrupt stored hash", () => {
    it.each([
      ["an empty string", ""],
      ["a bare digest", "deadbeef"],
      ["an unknown algorithm", "bcrypt$N=1024,r=8,p=1$c2FsdA$aGFzaA"],
      ["missing parameters", "scrypt$$c2FsdA$aGFzaA"],
      ["a non numeric cost", "scrypt$N=lots,r=8,p=1$c2FsdA$aGFzaA"],
      ["a truncated record", "scrypt$N=1024,r=8,p=1$c2FsdA"],
    ])("fails loudly rather than silently returning false for %s", async (_name, stored) => {
      await expect(hasher.verify("anything", stored)).rejects.toBeInstanceOf(
        MalformedPasswordHash,
      );
    });
  });
});
