import { Role } from "@waymark/domain";
import {
  FakeClock,
  InMemoryStorageUnitRepository,
  SequentialIdGenerator,
} from "@waymark/domain/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { CreateMachineToken } from "./create-machine-token.js";
import { MachineTokenScope } from "./machine-token.js";
import { InMemoryMachineTokenRepository } from "./machine-token-repository.fake.js";
import { hashMachineTokenSecret, looksLikeMachineToken } from "./machine-token-secret.js";
import { THE_SHELL } from "./machine-token-manager.js";
import { RotateMachineToken } from "./rotate-machine-token.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");
const LATER = new Date("2026-05-01T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("rotating a machine token", () => {
  let machineTokens: InMemoryMachineTokenRepository;
  let clock: FakeClock;
  let createMachineToken: CreateMachineToken;
  let rotateMachineToken: RotateMachineToken;

  const issue = async (
    name: string,
    scope: MachineTokenScope = MachineTokenScope.Read,
  ): Promise<string> =>
    (await createMachineToken.execute({ name, scope, userId: "dario" })).token;

  beforeEach(() => {
    machineTokens = new InMemoryMachineTokenRepository();
    clock = new FakeClock(NOW);
    createMachineToken = new CreateMachineToken({
      machineTokens,
      storageUnits: new InMemoryStorageUnitRepository(),
      ids: new SequentialIdGenerator("machine-token"),
      clock,
    });
    rotateMachineToken = new RotateMachineToken({ machineTokens, clock });
  });

  it("still belongs to the person it was issued for, whoever rotates it (ADR 26)", async () => {
    await createMachineToken.execute({
      name: "mcp-server",
      scope: MachineTokenScope.Read,
      userId: "partner",
    });

    // Rotated by the administrator, it must not become the administrator's:
    // a token acts as its owner, so that would widen what it sees.
    const rotated = await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });

    expect(rotated?.machineToken.userId).toBe("partner");
    expect((await machineTokens.findByName("mcp-server"))?.userId).toBe("partner");
  });

  describe("the secret it hands back", () => {
    it("is a machine token, recognisable as one", async () => {
      await issue("mcp-server");

      const rotated = await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });

      expect(looksLikeMachineToken(rotated?.token ?? "")).toBe(true);
    });

    it("is not the one that was there before", async () => {
      const before = await issue("mcp-server");

      const rotated = await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });

      expect(rotated?.token).not.toBe(before);
    });

    it("is never stored, only its hash", async () => {
      await issue("mcp-server");

      const rotated = await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });

      const stored = await machineTokens.findByName("mcp-server");
      expect(stored?.tokenHash).toBe(hashMachineTokenSecret(rotated?.token ?? ""));
      expect(JSON.stringify(stored)).not.toContain(rotated?.token);
    });
  });

  /**
   * The point of the operation. A rotation that left the old secret working
   * would be a creation with extra steps, and the reason anybody rotates is
   * that they believe the old one is somewhere it should not be.
   */
  describe("what happens to the secret it replaces", () => {
    it("stops opening anything, immediately", async () => {
      const before = await issue("mcp-server");

      await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });

      expect(
        await machineTokens.findByTokenHash(hashMachineTokenSecret(before)),
      ).toBeNull();
    });

    it("leaves exactly one live secret behind the name, never two", async () => {
      await issue("mcp-server");

      await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });

      expect(await machineTokens.list()).toHaveLength(1);
    });
  });

  describe("what it keeps", () => {
    it("keeps the name, because that is what a compose file and a revoke use", async () => {
      await issue("mcp-server");

      const rotated = await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });

      expect(rotated?.machineToken.name).toBe("mcp-server");
    });

    /**
     * There is no `scope` on the command, and this is the case that says why
     * it must stay that way: rotation is maintenance, and maintenance that can
     * turn a read key into a writing one is an escalation path with a friendly
     * name on it. Widening a scope means issuing a new credential under a new
     * name, deliberately, and revoking the old one.
     */
    it("cannot widen a read key into a writing one", async () => {
      await issue("mcp-server", MachineTokenScope.Read);

      const rotated = await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });

      expect(rotated?.machineToken.scope).toBe(MachineTokenScope.Read);
    });

    it("keeps a read-write scope too, rather than narrowing one by surprise", async () => {
      await issue("filer", MachineTokenScope.ReadWrite);

      const rotated = await rotateMachineToken.execute({ name: "filer", by: THE_SHELL });

      expect(rotated?.machineToken.scope).toBe(MachineTokenScope.ReadWrite);
    });

    it("normalizes the name, so capitals do not miss a live credential", async () => {
      await issue("mcp-server");

      expect(
        await rotateMachineToken.execute({ name: "  MCP-Server  ", by: THE_SHELL }),
      ).not.toBeNull();
    });
  });

  describe("what it resets", () => {
    /**
     * `lastUsedAt` is the field a person reads to decide whether anything is
     * still using a credential. Carried across a rotation it would describe
     * traffic that belonged to a secret that no longer exists, and an operator
     * would read "in use an hour ago" about a token nothing has ever
     * presented.
     */
    it("forgets when the old secret was last used", async () => {
      await issue("mcp-server");
      await machineTokens.recordLastUsed("machine-token-1", NOW);

      const rotated = await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });

      expect(rotated?.machineToken.lastUsedAt).toBeNull();
    });

    it("dates the credential from the moment the new secret was issued", async () => {
      await issue("mcp-server");
      clock.advanceTo(LATER);

      const rotated = await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });

      expect(rotated?.machineToken.createdAt).toEqual(LATER);
    });
  });

  /**
   * An expiry is a duration somebody chose once, and only the resulting DATE
   * is stored. Carrying that date forward would make every rotation shorten
   * the credential's life until it expired on the day it was reissued, so the
   * expiry is asked for again or it is not set at all.
   */
  describe("the expiry", () => {
    it("never lapses when none is asked for, even if the old one did", async () => {
      await createMachineToken.execute({
        name: "filer",
        scope: MachineTokenScope.ReadWrite,
        userId: "dario",
        expiresInDays: 90,
      });

      const rotated = await rotateMachineToken.execute({ name: "filer", by: THE_SHELL });

      expect(rotated?.machineToken.expiresAt).toBeNull();
    });

    it("is counted from the rotation, not from the original issue", async () => {
      await issue("mcp-server");
      clock.advanceTo(LATER);

      const rotated = await rotateMachineToken.execute({
        name: "mcp-server",
        expiresInDays: 30,
        by: THE_SHELL,
      });

      expect(rotated?.machineToken.expiresAt).toEqual(
        new Date(LATER.getTime() + 30 * DAY),
      );
    });
  });

  describe("a name that is not there", () => {
    /**
     * `null` rather than a thrown error, and deliberately not silent success:
     * rotating a credential is a person acting on a decision, and "done" in
     * answer to a misspelled name lets them walk away believing a secret they
     * still hold has been replaced.
     */
    it("answers with nothing rather than inventing a credential", async () => {
      expect(await rotateMachineToken.execute({ name: "never-issued", by: THE_SHELL })).toBeNull();
    });

    it("creates nothing on the way past", async () => {
      await rotateMachineToken.execute({ name: "never-issued", by: THE_SHELL });

      expect(await machineTokens.list()).toEqual([]);
    });
  });

  it("touches no other token", async () => {
    const backup = await issue("backup", MachineTokenScope.ReadWrite);
    await issue("mcp-server");

    await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });

    expect(
      (await machineTokens.findByTokenHash(hashMachineTokenSecret(backup)))?.name,
    ).toBe("backup");
  });

  it("can be done twice, killing the secret it issued the first time", async () => {
    await issue("mcp-server");

    const first = await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });
    const second = await rotateMachineToken.execute({ name: "mcp-server", by: THE_SHELL });

    expect(
      await machineTokens.findByTokenHash(hashMachineTokenSecret(first?.token ?? "")),
    ).toBeNull();
    expect(
      (
        await machineTokens.findByTokenHash(
          hashMachineTokenSecret(second?.token ?? ""),
        )
      )?.name,
    ).toBe("mcp-server");
  });

  describe("who may rotate it (ADR 26)", () => {
    beforeEach(async () => {
      await createMachineToken.execute({
        name: "anas-assistant",
        scope: MachineTokenScope.Read,
        userId: "ana",
      });
    });

    it("lets the person who issued it", async () => {
      const rotated = await rotateMachineToken.execute({
        name: "anas-assistant",
        by: { kind: "person", userId: "ana", role: Role.USER },
      });

      expect(rotated?.machineToken.name).toBe("anas-assistant");
    });

    it("lets an administrator rotate anybody's", async () => {
      const rotated = await rotateMachineToken.execute({
        name: "anas-assistant",
        by: { kind: "person", userId: "dario", role: Role.ADMINISTRATOR },
      });

      expect(rotated?.machineToken.userId).toBe("ana");
    });

    it("answers anybody else as if there were nothing by that name, and keeps the secret", async () => {
      const before = (await machineTokens.findByName("anas-assistant"))?.tokenHash;

      const rotated = await rotateMachineToken.execute({
        name: "anas-assistant",
        by: { kind: "person", userId: "bea", role: Role.USER },
      });

      expect(rotated).toBeNull();
      expect((await machineTokens.findByName("anas-assistant"))?.tokenHash).toBe(before);
    });
  });
});
