import { describe, expect, it } from "vitest";

import {
  MACHINE_TOKEN_SCOPES,
  MachineTokenScope,
  isMachineTokenScope,
  mayWriteWith,
  normalizeMachineTokenName,
} from "./machine-token.js";

describe("machine token names", () => {
  it("is stored lower case, so revoking one is never a guess about capitals", () => {
    expect(normalizeMachineTokenName("MCP-Server")).toBe("mcp-server");
  });

  it("is trimmed, because a trailing space is invisible in a shell", () => {
    expect(normalizeMachineTokenName("  mcp-server \n")).toBe("mcp-server");
  });

  it("leaves an already normalized name alone", () => {
    expect(normalizeMachineTokenName("mcp-server")).toBe("mcp-server");
  });
});

describe("machine token scopes", () => {
  it("has exactly two, because a third would be a role system", () => {
    expect([...MACHINE_TOKEN_SCOPES]).toEqual(["read", "read-write"]);
  });

  it("recognises the two it has", () => {
    expect(isMachineTokenScope("read")).toBe(true);
    expect(isMachineTokenScope("read-write")).toBe(true);
  });

  it("refuses anything else, including the plausible spellings", () => {
    expect(isMachineTokenScope("write")).toBe(false);
    expect(isMachineTokenScope("readwrite")).toBe(false);
    expect(isMachineTokenScope("admin")).toBe(false);
    expect(isMachineTokenScope("")).toBe(false);
  });

  describe("what each one may do", () => {
    it("lets a read-write token write", () => {
      expect(mayWriteWith(MachineTokenScope.ReadWrite)).toBe(true);
    });

    it("refuses a read token a write, whatever asked for it", () => {
      expect(mayWriteWith(MachineTokenScope.Read)).toBe(false);
    });
  });
});
