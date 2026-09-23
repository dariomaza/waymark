import { describe, expect, it } from "vitest";

import { parseMachineTokenCommand } from "./machine-token-command.js";

const parse = (...argv: string[]) => parseMachineTokenCommand(argv);

describe("parsing a machine-token command", () => {
  describe("create", () => {
    it("takes a name and a scope", () => {
      expect(parse("create", "--name", "mcp-server", "--scope", "read")).toEqual({
        kind: "create",
        name: "mcp-server",
        scope: "read",
        expiresInDays: null,
      });
    });

    it("takes read-write", () => {
      expect(parse("create", "--name", "filer", "--scope", "read-write")).toMatchObject(
        { scope: "read-write" },
      );
    });

    it("takes an optional lifetime", () => {
      expect(
        parse("create", "--name", "mcp", "--scope", "read", "--expires-in-days", "30"),
      ).toMatchObject({ expiresInDays: 30 });
    });

    it("never lapses when no lifetime is given, which is the normal case", () => {
      expect(parse("create", "--name", "mcp", "--scope", "read")).toMatchObject({
        expiresInDays: null,
      });
    });

    it("refuses a missing scope rather than guessing at one", () => {
      // Defaulting to `read` would be friendly and wrong: a token that is
      // narrower than the operator believed fails confusingly at 3am, and
      // defaulting the other way hands out a writing credential by accident.
      expect(parse("create", "--name", "mcp")).toMatchObject({ kind: "error" });
    });

    it("refuses a scope that is not one of the two", () => {
      expect(
        parse("create", "--name", "mcp", "--scope", "admin"),
      ).toMatchObject({ kind: "error" });
    });

    it("says which scopes exist when it refuses one", () => {
      const parsed = parse("create", "--name", "mcp", "--scope", "write");

      expect(parsed.kind).toBe("error");
      expect(parsed.kind === "error" && parsed.message).toContain("read-write");
    });

    it("refuses a missing name", () => {
      expect(parse("create", "--scope", "read")).toMatchObject({ kind: "error" });
    });

    it.each(["0", "-5", "nope", "1.5"])(
      "refuses %o as a number of days",
      (days) => {
        expect(
          parse("create", "--name", "mcp", "--scope", "read", "--expires-in-days", days),
        ).toMatchObject({ kind: "error" });
      },
    );
  });

  describe("revoke", () => {
    it("takes a name", () => {
      expect(parse("revoke", "--name", "mcp-server")).toEqual({
        kind: "revoke",
        name: "mcp-server",
      });
    });

    it("refuses a revoke with no name, because that could only mean all of them", () => {
      expect(parse("revoke")).toMatchObject({ kind: "error" });
    });

    it("refuses a scope on a revoke rather than ignoring it", () => {
      // Silently ignoring it would let somebody believe they had revoked only
      // the read half of something.
      expect(parse("revoke", "--name", "mcp", "--scope", "read")).toMatchObject({
        kind: "error",
      });
    });
  });

  describe("list", () => {
    it("takes nothing", () => {
      expect(parse("list")).toEqual({ kind: "list" });
    });

    it("refuses arguments it would only ignore", () => {
      expect(parse("list", "--name", "mcp")).toMatchObject({ kind: "error" });
    });
  });

  describe("anything else", () => {
    it("refuses no subcommand at all", () => {
      expect(parse()).toMatchObject({ kind: "error" });
    });

    it("refuses a subcommand nobody implemented", () => {
      expect(parse("rotate", "--name", "mcp")).toMatchObject({ kind: "error" });
    });

    it("refuses an unknown flag rather than ignoring it", () => {
      expect(
        parse("create", "--name", "mcp", "--scope", "read", "--forever"),
      ).toMatchObject({ kind: "error" });
    });

    it("answers with help when asked", () => {
      expect(parse("--help")).toMatchObject({ kind: "help" });
      expect(parse("-h")).toMatchObject({ kind: "help" });
    });

    it("refuses a secret passed as an argument, on principle", () => {
      // There is nothing to pass — the secret is generated here and printed
      // once — so a `--token` can only be somebody misunderstanding what this
      // command does, and the honest answer is to say so rather than ignore it.
      expect(
        parse("create", "--name", "mcp", "--scope", "read", "--token", "wmk_x"),
      ).toMatchObject({ kind: "error" });
    });
  });
});
