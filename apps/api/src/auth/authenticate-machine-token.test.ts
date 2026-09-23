import { FakeClock } from "@waymark/domain/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { InvalidMachineToken } from "./auth-errors.js";
import { AuthenticateMachineToken } from "./authenticate-machine-token.js";
import {
  LAST_USED_GRANULARITY_MS,
  MachineTokenScope,
  type MachineToken,
} from "./machine-token.js";
import { InMemoryMachineTokenRepository } from "./machine-token-repository.fake.js";
import { issueMachineTokenSecret } from "./machine-token-secret.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("authenticating a machine token", () => {
  let machineTokens: InMemoryMachineTokenRepository;
  let clock: FakeClock;
  let authenticate: AuthenticateMachineToken;

  const store = async (
    overrides: Partial<MachineToken> = {},
  ): Promise<string> => {
    const { token, tokenHash } = issueMachineTokenSecret();
    await machineTokens.create({
      id: "machine-token-1",
      name: "mcp-server",
      tokenHash,
      scope: MachineTokenScope.Read,
      createdAt: NOW,
      expiresAt: null,
      lastUsedAt: null,
      ...overrides,
    });

    return token;
  };

  beforeEach(() => {
    machineTokens = new InMemoryMachineTokenRepository();
    clock = new FakeClock(NOW);
    authenticate = new AuthenticateMachineToken({ machineTokens, clock });
  });

  describe("letting a live token in", () => {
    it("answers with the token behind the secret", async () => {
      const token = await store();

      const caller = await authenticate.execute(token);

      expect(caller.name).toBe("mcp-server");
      expect(caller.scope).toBe("read");
    });

    it("lets a token with no expiry in, however old it is", async () => {
      const token = await store({ expiresAt: null });
      clock.advanceBy(900 * DAY);

      await expect(authenticate.execute(token)).resolves.toBeDefined();
    });

    it("lets a token in right up to its expiry", async () => {
      const token = await store({ expiresAt: new Date(NOW.getTime() + DAY) });
      clock.advanceBy(DAY - 1);

      await expect(authenticate.execute(token)).resolves.toBeDefined();
    });
  });

  describe("refusing one", () => {
    it("refuses a secret nobody was issued", async () => {
      await store();

      await expect(
        authenticate.execute(issueMachineTokenSecret().token),
      ).rejects.toThrow(InvalidMachineToken);
    });

    it("refuses a revoked token", async () => {
      const token = await store();
      await machineTokens.deleteByName("mcp-server");

      await expect(authenticate.execute(token)).rejects.toThrow(
        InvalidMachineToken,
      );
    });

    it("refuses an expired token", async () => {
      const token = await store({ expiresAt: new Date(NOW.getTime() + DAY) });
      clock.advanceBy(DAY);

      await expect(authenticate.execute(token)).rejects.toThrow(
        InvalidMachineToken,
      );
    });

    it("keeps the expired row, so `list` can still say why it stopped working", async () => {
      const token = await store({ expiresAt: new Date(NOW.getTime() + DAY) });
      clock.advanceBy(DAY);

      await expect(authenticate.execute(token)).rejects.toThrow();

      // A session deletes its own dead row because nobody ever looks at a
      // session table. An admin DOES look at this one, and "the token you are
      // asking about is gone" is a worse answer than "it lapsed on Tuesday".
      expect(await machineTokens.findByName("mcp-server")).not.toBeNull();
    });

    it("refuses a session token presented as a machine token", async () => {
      await store();
      // What `issueSessionToken` produces: base64url with no prefix.
      const sessionShaped = "8Zr3kQqYhV2nP0sL1tXbA9cD7eF4gH6iJ5kM8nO2pQ";

      await expect(authenticate.execute(sessionShaped)).rejects.toThrow(
        InvalidMachineToken,
      );
    });

    it("refuses a malformed secret without asking the database at all", async () => {
      let reads = 0;
      const counting = {
        ...machineTokens,
        findByTokenHash: async (hash: string) => {
          reads += 1;
          return machineTokens.findByTokenHash(hash);
        },
      };
      const guard = new AuthenticateMachineToken({
        machineTokens: counting as typeof machineTokens,
        clock,
      });

      await expect(guard.execute("not-a-machine-token")).rejects.toThrow(
        InvalidMachineToken,
      );
      expect(reads).toBe(0);
    });

    it("says the same thing for unknown, revoked and expired", async () => {
      const revoked = await store();
      await machineTokens.deleteByName("mcp-server");
      const expired = await store({
        id: "machine-token-2",
        name: "backup",
        expiresAt: new Date(NOW.getTime() - 1),
      });

      const messages = await Promise.all(
        [revoked, expired, issueMachineTokenSecret().token].map(async (token) =>
          authenticate.execute(token).catch((error: Error) => error.message),
        ),
      );

      expect(new Set(messages).size).toBe(1);
    });
  });

  describe("recording that it was used", () => {
    it("stamps a token the first time it is presented", async () => {
      const token = await store();

      await authenticate.execute(token);

      expect((await machineTokens.findByName("mcp-server"))?.lastUsedAt).toEqual(
        NOW,
      );
    });

    it("does not write again inside the hour, so a busy machine is not a write storm", async () => {
      const token = await store();
      await authenticate.execute(token);

      clock.advanceBy(LAST_USED_GRANULARITY_MS - 1);
      await authenticate.execute(token);

      expect((await machineTokens.findByName("mcp-server"))?.lastUsedAt).toEqual(
        NOW,
      );
    });

    it("writes again once the hour has passed", async () => {
      const token = await store();
      await authenticate.execute(token);

      clock.advanceBy(LAST_USED_GRANULARITY_MS);
      await authenticate.execute(token);

      expect((await machineTokens.findByName("mcp-server"))?.lastUsedAt).toEqual(
        new Date(NOW.getTime() + LAST_USED_GRANULARITY_MS),
      );
    });

    it("answers with the stamp it just wrote, not the stale one it read", async () => {
      const token = await store();

      const caller = await authenticate.execute(token);

      expect(caller.lastUsedAt).toEqual(NOW);
    });

    it("never stamps a token it refused", async () => {
      const token = await store({ expiresAt: new Date(NOW.getTime() - 1) });

      await expect(authenticate.execute(token)).rejects.toThrow();

      expect((await machineTokens.findByName("mcp-server"))?.lastUsedAt).toBeNull();
    });
  });
});
