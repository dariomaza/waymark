import { FakeClock, SequentialIdGenerator } from "@waymark/domain/testing";
import { beforeEach, describe, expect, it } from "vitest";

import {
  InvalidMachineTokenName,
  MachineTokenNameAlreadyTaken,
} from "./auth-errors.js";
import { CreateMachineToken } from "./create-machine-token.js";
import { MachineTokenScope } from "./machine-token.js";
import { InMemoryMachineTokenRepository } from "./machine-token-repository.fake.js";
import { hashMachineTokenSecret, looksLikeMachineToken } from "./machine-token-secret.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("creating a machine token", () => {
  let machineTokens: InMemoryMachineTokenRepository;
  let clock: FakeClock;
  let createMachineToken: CreateMachineToken;

  beforeEach(() => {
    machineTokens = new InMemoryMachineTokenRepository();
    clock = new FakeClock(NOW);
    createMachineToken = new CreateMachineToken({
      machineTokens,
      ids: new SequentialIdGenerator("machine-token"),
      clock,
    });
  });

  describe("the secret it hands back", () => {
    it("is a machine token, recognisable as one", async () => {
      const { token } = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
      });

      expect(looksLikeMachineToken(token)).toBe(true);
    });

    it("is never stored, only its hash", async () => {
      const { token } = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
      });

      const stored = await machineTokens.findByName("mcp-server");
      expect(stored?.tokenHash).toBe(hashMachineTokenSecret(token));
      expect(stored?.tokenHash).not.toBe(token);
      expect(JSON.stringify(stored)).not.toContain(token);
    });

    it("is different every time, even for the same name after a revoke", async () => {
      const first = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
      });
      await machineTokens.deleteByName("mcp-server");
      const second = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
      });

      expect(second.token).not.toBe(first.token);
    });
  });

  describe("the record it writes", () => {
    it("keeps the scope it was asked for", async () => {
      await createMachineToken.execute({
        name: "backup",
        scope: MachineTokenScope.ReadWrite,
      });

      expect((await machineTokens.findByName("backup"))?.scope).toBe(
        "read-write",
      );
    });

    it("stamps the creation from the clock, never from the wall", async () => {
      const { machineToken } = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
      });

      expect(machineToken.createdAt).toEqual(NOW);
    });

    it("has never been used yet, and says so", async () => {
      const { machineToken } = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
      });

      expect(machineToken.lastUsedAt).toBeNull();
    });

    it("never lapses unless somebody asked for a lifetime", async () => {
      const { machineToken } = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
      });

      expect(machineToken.expiresAt).toBeNull();
    });

    it("lapses when a lifetime was asked for, counted from now", async () => {
      const { machineToken } = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
        expiresInDays: 30,
      });

      expect(machineToken.expiresAt).toEqual(new Date(NOW.getTime() + 30 * DAY));
    });
  });

  describe("the name", () => {
    it("is normalized, so revoking it later is not a guess about capitals", async () => {
      await createMachineToken.execute({
        name: "  MCP-Server ",
        scope: MachineTokenScope.Read,
      });

      expect(await machineTokens.findByName("mcp-server")).not.toBeNull();
    });

    it("refuses a second token under a name already in use", async () => {
      await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
      });

      await expect(
        createMachineToken.execute({
          name: "MCP-SERVER",
          scope: MachineTokenScope.ReadWrite,
        }),
      ).rejects.toThrow(MachineTokenNameAlreadyTaken);
    });

    it("leaves the live token alone when a duplicate is refused", async () => {
      const first = await createMachineToken.execute({
        name: "mcp-server",
        scope: MachineTokenScope.Read,
      });

      await expect(
        createMachineToken.execute({
          name: "mcp-server",
          scope: MachineTokenScope.ReadWrite,
        }),
      ).rejects.toThrow();

      const stored = await machineTokens.findByName("mcp-server");
      expect(stored?.tokenHash).toBe(hashMachineTokenSecret(first.token));
      expect(stored?.scope).toBe("read");
    });

    it("refuses an empty name, because a token nobody can name cannot be revoked", async () => {
      await expect(
        createMachineToken.execute({ name: "   ", scope: MachineTokenScope.Read }),
      ).rejects.toThrow(InvalidMachineTokenName);
    });

    it.each(["mcp server", "mcp/server", "mcp;rm -rf", "café"])(
      "refuses %o, which is a name somebody has to retype into a shell",
      async (name) => {
        await expect(
          createMachineToken.execute({ name, scope: MachineTokenScope.Read }),
        ).rejects.toThrow(InvalidMachineTokenName);
      },
    );

    it.each(["mcp-server", "backup2", "home_assistant", "mcp.read"])(
      "accepts %o",
      async (name) => {
        await expect(
          createMachineToken.execute({ name, scope: MachineTokenScope.Read }),
        ).resolves.toBeDefined();
      },
    );
  });
});
