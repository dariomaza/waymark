import {
  FakeClock,
  InMemoryStorageUnitRepository,
  SequentialIdGenerator,
} from "@waymark/domain/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { CreateMachineToken } from "./create-machine-token.js";
import { Role } from "@waymark/domain";

import { MachineTokenScope } from "./machine-token.js";
import { InMemoryMachineTokenRepository } from "./machine-token-repository.fake.js";
import { THE_SHELL } from "./machine-token-manager.js";
import { RevokeMachineToken } from "./revoke-machine-token.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");

describe("revoking a machine token", () => {
  let machineTokens: InMemoryMachineTokenRepository;
  let createMachineToken: CreateMachineToken;
  let revokeMachineToken: RevokeMachineToken;

  beforeEach(() => {
    machineTokens = new InMemoryMachineTokenRepository();
    createMachineToken = new CreateMachineToken({
      machineTokens,
      storageUnits: new InMemoryStorageUnitRepository(),
      ids: new SequentialIdGenerator("machine-token"),
      clock: new FakeClock(NOW),
    });
    revokeMachineToken = new RevokeMachineToken({ machineTokens });
  });

  it("removes the token the name belongs to", async () => {
    await createMachineToken.execute({
      name: "mcp-server",
      scope: MachineTokenScope.Read,
      userId: "dario",
    });

    expect(await revokeMachineToken.execute("mcp-server", THE_SHELL)).toBe(true);
    expect(await machineTokens.findByName("mcp-server")).toBeNull();
  });

  it("normalizes the name, so capitals do not hide a live credential", async () => {
    await createMachineToken.execute({
      name: "mcp-server",
      scope: MachineTokenScope.Read,
      userId: "dario",
    });

    expect(await revokeMachineToken.execute("  MCP-Server  ", THE_SHELL)).toBe(true);
  });

  it("says it removed nothing rather than reporting success at a typo", async () => {
    await createMachineToken.execute({
      name: "mcp-server",
      scope: MachineTokenScope.Read,
      userId: "dario",
    });

    expect(await revokeMachineToken.execute("mcp-serve", THE_SHELL)).toBe(false);
    expect(await machineTokens.findByName("mcp-server")).not.toBeNull();
  });

  it("takes exactly one token, never the whole table", async () => {
    await createMachineToken.execute({
      name: "mcp-server",
      scope: MachineTokenScope.Read,
      userId: "dario",
    });
    await createMachineToken.execute({
      name: "backup",
      scope: MachineTokenScope.ReadWrite,
      userId: "dario",
    });

    await revokeMachineToken.execute("mcp-server", THE_SHELL);

    expect(await machineTokens.findByName("backup")).not.toBeNull();
  });

  describe("who may revoke it (ADR 26)", () => {
    const BEA = { kind: "person", userId: "bea", role: Role.USER } as const;
    const ADMINISTRATOR = { kind: "person", userId: "dario", role: Role.ADMINISTRATOR } as const;

    beforeEach(async () => {
      await createMachineToken.execute({
        name: "anas-assistant",
        scope: MachineTokenScope.Read,
        userId: "ana",
      });
    });

    it("lets the person who issued it", async () => {
      expect(
        await revokeMachineToken.execute("anas-assistant", {
          kind: "person",
          userId: "ana",
          role: Role.USER,
        }),
      ).toBe(true);
    });

    it("lets an administrator revoke anybody's", async () => {
      expect(await revokeMachineToken.execute("anas-assistant", ADMINISTRATOR)).toBe(true);
    });

    it("answers anybody else as if there were nothing by that name, and keeps it", async () => {
      expect(await revokeMachineToken.execute("anas-assistant", BEA)).toBe(false);
      expect(await machineTokens.findByName("anas-assistant")).not.toBeNull();
    });
  });
});
