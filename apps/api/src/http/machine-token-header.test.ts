import { describe, expect, it } from "vitest";

import { bearerTokenOf } from "./bearer-token.js";
import {
  claimsMachineScheme,
  isWriteRequest,
  machineTokenOf,
} from "./machine-token-header.js";

const A_MACHINE_TOKEN = "wmk_Zm9vYmFyYmF6";
const A_SESSION_TOKEN = "8Zr3kQqYhV2nP0sL1tXbA9cD7eF4gH6iJ5kM8nO2pQ";

describe("reading a machine token off the Authorization header", () => {
  it("reads one presented under the Machine scheme", () => {
    expect(machineTokenOf(`Machine ${A_MACHINE_TOKEN}`)).toBe(A_MACHINE_TOKEN);
  });

  it("compares the scheme case insensitively, as RFC 7235 says to", () => {
    expect(machineTokenOf(`machine ${A_MACHINE_TOKEN}`)).toBe(A_MACHINE_TOKEN);
    expect(machineTokenOf(`MACHINE ${A_MACHINE_TOKEN}`)).toBe(A_MACHINE_TOKEN);
  });

  it("tolerates the surrounding whitespace a shell heredoc leaves behind", () => {
    expect(machineTokenOf(`  Machine\t${A_MACHINE_TOKEN}  `)).toBe(
      A_MACHINE_TOKEN,
    );
  });

  it("reads nothing from a header that arrived twice", () => {
    expect(machineTokenOf([`Machine ${A_MACHINE_TOKEN}`, "Machine other"])).toBeNull();
  });

  it("reads nothing from a scheme with no credential behind it", () => {
    expect(machineTokenOf("Machine")).toBeNull();
  });

  it("reads nothing when there is no header at all", () => {
    expect(machineTokenOf(undefined)).toBeNull();
  });
});

/**
 * The property the whole scheme split exists for. These four cases are the
 * reason a leak of one credential cannot be replayed as the other: the header
 * parser refuses the cross before any table is consulted.
 */
describe("the two schemes do not accept each other's credentials", () => {
  it("does not read a machine token out of a Bearer header", () => {
    expect(machineTokenOf(`Bearer ${A_MACHINE_TOKEN}`)).toBeNull();
  });

  it("does not read a session token out of a Machine header", () => {
    expect(bearerTokenOf(`Machine ${A_SESSION_TOKEN}`)).toBeNull();
  });

  it("still reads a session token out of a Bearer header, untouched", () => {
    expect(bearerTokenOf(`Bearer ${A_SESSION_TOKEN}`)).toBe(A_SESSION_TOKEN);
  });

  it("reads a machine token out of a Machine header", () => {
    expect(machineTokenOf(`Machine ${A_MACHINE_TOKEN}`)).toBe(A_MACHINE_TOKEN);
  });
});

describe("telling which scheme a caller claimed", () => {
  it("recognises the machine scheme whatever it carries", () => {
    expect(claimsMachineScheme("Machine anything-at-all")).toBe(true);
  });

  it("does not mistake a bearer caller for a machine one", () => {
    expect(claimsMachineScheme(`Bearer ${A_SESSION_TOKEN}`)).toBe(false);
  });

  it("does not mistake a missing header for a machine one", () => {
    expect(claimsMachineScheme(undefined)).toBe(false);
  });

  it("does not mistake a scheme that merely starts the same way", () => {
    expect(claimsMachineScheme("Machinery something")).toBe(false);
  });
});

describe("which requests count as a write", () => {
  it.each(["GET", "HEAD", "OPTIONS"])("treats %s as a read", (method) => {
    expect(isWriteRequest(method)).toBe(false);
  });

  it.each(["POST", "PATCH", "PUT", "DELETE"])(
    "treats %s as a write",
    (method) => {
      expect(isWriteRequest(method)).toBe(true);
    },
  );

  it("treats a method nobody has invented yet as a write", () => {
    // The list is of READS, so anything new is refused to a read-only token
    // rather than waved through. A stale allowlist of writes would fail the
    // other way, silently, on the day somebody adds a route.
    expect(isWriteRequest("PURGE")).toBe(true);
  });

  it("does not care how the method was capitalised", () => {
    expect(isWriteRequest("get")).toBe(false);
    expect(isWriteRequest("delete")).toBe(true);
  });
});
