import { Role, WHOLE_REACH } from "@waymark/domain";
import { describe, expect, it } from "vitest";

import {
  callerMayWrite,
  callerName,
  personBehind,
  type Caller,
} from "./caller.js";
import { MachineTokenScope } from "./machine-token.js";
import { SessionOpener } from "./session.js";

const NOW = new Date("2026-04-01T10:00:00.000Z");

const aPerson: Caller = {
  kind: "user",
  user: {
    id: "user-1",
    username: "dario",
    passwordHash: "scrypt$...",
    role: Role.ADMINISTRATOR,
    createdAt: NOW,
    updatedAt: NOW,
    disabledAt: null,
  },
  session: {
    id: "session-1",
    tokenHash: "hash",
    userId: "user-1",
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 1000),
    createdWith: SessionOpener.Password,
  },
};

const aMachine = (scope: MachineTokenScope): Caller => ({
  kind: "machine",
  machineToken: {
    id: "machine-token-1",
    name: "mcp-server",
    tokenHash: "hash",
    scope,
    userId: "user-9",
    createdAt: NOW,
    expiresAt: null,
    lastUsedAt: null,
    chosenSpaces: WHOLE_REACH,
  },
});

describe("what a caller may do", () => {
  it("lets a person write", () => {
    // Who may change WHICH space is decided against their access (ADR 26);
    // a machine token's scope narrows a MACHINE, never a person.
    expect(callerMayWrite(aPerson)).toBe(true);
  });

  it("lets a read-write machine write", () => {
    expect(callerMayWrite(aMachine(MachineTokenScope.ReadWrite))).toBe(true);
  });

  it("refuses a read-only machine", () => {
    expect(callerMayWrite(aMachine(MachineTokenScope.Read))).toBe(false);
  });
});

describe("naming a caller for a log", () => {
  it("names a person by their username", () => {
    expect(callerName(aPerson)).toBe("dario");
  });

  it("names a machine by the name it was issued under", () => {
    expect(callerName(aMachine(MachineTokenScope.Read))).toBe("mcp-server");
  });
});

describe("whom a caller acts as (ADR 26)", () => {
  it("is the person signed in, for a session", () => {
    expect(personBehind(aPerson)).toBe("user-1");
  });

  it("is the person who issued it, for a machine token", () => {
    expect(personBehind(aMachine(MachineTokenScope.ReadWrite))).toBe("user-9");
  });
});
