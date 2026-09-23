import { FakeClock, SequentialIdGenerator } from "@waymark/domain/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { CreateMachineToken } from "./create-machine-token.js";
import { MachineTokenScope } from "./machine-token.js";
import { InMemoryMachineTokenRepository } from "./machine-token-repository.fake.js";
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
      ids: new SequentialIdGenerator("machine-token"),
      clock: new FakeClock(NOW),
    });
    revokeMachineToken = new RevokeMachineToken({ machineTokens });
  });

  it("removes the token the name belongs to", async () => {
    await createMachineToken.execute({
      name: "mcp-server",
      scope: MachineTokenScope.Read,
    });

    expect(await revokeMachineToken.execute("mcp-server")).toBe(true);
    expect(await machineTokens.findByName("mcp-server")).toBeNull();
  });

  it("normalizes the name, so capitals do not hide a live credential", async () => {
    await createMachineToken.execute({
      name: "mcp-server",
      scope: MachineTokenScope.Read,
    });

    expect(await revokeMachineToken.execute("  MCP-Server  ")).toBe(true);
  });

  it("says it removed nothing rather than reporting success at a typo", async () => {
    await createMachineToken.execute({
      name: "mcp-server",
      scope: MachineTokenScope.Read,
    });

    expect(await revokeMachineToken.execute("mcp-serve")).toBe(false);
    expect(await machineTokens.findByName("mcp-server")).not.toBeNull();
  });

  it("takes exactly one token, never the whole table", async () => {
    await createMachineToken.execute({
      name: "mcp-server",
      scope: MachineTokenScope.Read,
    });
    await createMachineToken.execute({
      name: "backup",
      scope: MachineTokenScope.ReadWrite,
    });

    await revokeMachineToken.execute("mcp-server");

    expect(await machineTokens.findByName("backup")).not.toBeNull();
  });
});
