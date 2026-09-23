import { describe, expect, it } from "vitest";

import {
  InvalidMachineToken,
  InvalidMachineTokenName,
  MachineTokenNameAlreadyTaken,
  ReadOnlyMachineToken,
} from "./auth-errors.js";

/**
 * `AuthError` sets `Error.name` to the class name so that one `instanceof` and
 * one field are enough to tell a deliberate refusal from a crash in a log.
 *
 * A machine token has a `name` of its own, and a parameter property spelled
 * `name` would silently overwrite that — so an audit line about a read-only
 * token being refused a write would read `mcp-server: ...` rather than
 * `ReadOnlyMachineToken: ...`, and the one grep anybody would reach for would
 * find nothing. The field is `tokenName`, and this is the test that keeps it
 * that way.
 */
describe("machine token refusals are identifiable in a log", () => {
  it.each([
    ["InvalidMachineToken", new InvalidMachineToken()],
    ["ReadOnlyMachineToken", new ReadOnlyMachineToken("mcp-server", "POST")],
    [
      "MachineTokenNameAlreadyTaken",
      new MachineTokenNameAlreadyTaken("mcp-server"),
    ],
    ["InvalidMachineTokenName", new InvalidMachineTokenName("mcp server")],
  ])("names itself %s", (expected, error) => {
    expect(error.name).toBe(expected);
  });

  it("keeps the token's own name on a field of its own", () => {
    expect(new ReadOnlyMachineToken("mcp-server", "POST").tokenName).toBe(
      "mcp-server",
    );
  });

  it("says which method was refused, so a log line is actionable", () => {
    expect(new ReadOnlyMachineToken("mcp-server", "DELETE").message).toContain(
      "DELETE",
    );
  });

  it("says nothing about WHY a machine token was refused", () => {
    // Unknown, revoked, expired and malformed are one message. Which of the
    // four it was is free information for whoever stole it.
    expect(new InvalidMachineToken().message).toBe(
      "The machine token is missing, invalid, revoked or expired",
    );
  });
});
