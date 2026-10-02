import { parseArgs } from "node:util";

import {
  MACHINE_TOKEN_SCOPES,
  isMachineTokenScope,
  type MachineTokenScope,
} from "../auth/machine-token.js";

/**
 * The argument parsing for `machine-token`, as a pure function.
 *
 * It is separate from the script for one reason: it is the only part with a
 * decision in it, and a script whose last line is `await main()` cannot be
 * imported by a test without running. Everything left in `machine-token.ts` is
 * I/O — read the config, open the database, print — and everything with a rule
 * in it is here, under test.
 */
export type MachineTokenCommand =
  | {
      readonly kind: "create";
      readonly name: string;
      readonly scope: MachineTokenScope;
      readonly expiresInDays: number | null;
      /** Whom it is issued for; `null` means the oldest administrator (ADR 26). */
      readonly username: string | null;
      /** The spaces to narrow it to; `null` means none chosen (ADR 26). */
      readonly spaceIds: readonly string[] | null;
    }
  | { readonly kind: "revoke"; readonly name: string }
  | { readonly kind: "list" }
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string };

export const USAGE = `
Usage: pnpm --filter @waymark/api machine-token <command>

  create --name <name> --scope <read|read-write> [--expires-in-days <n>]
         [--username <person>] [--space <id>]...
      Issues a token and prints it ONCE. It is stored hashed and cannot be
      shown again. It belongs to, and acts as, the person --username names;
      without it, the oldest administrator. Each --space narrows it to that
      space and everything under it, among what that person can see; without
      any, it reaches everything they can.

  revoke --name <name>
      Deletes that one token. No human account and no other token is touched,
      and it stops working on the very next request.

  list
      Every token: name, scope, when it was created, when it lapses, and when
      it was last used. Never the secret; there is none stored.

The secret is never taken as an argument. There is nothing to pass: it is
generated here and printed once.
`.trim();

const fail = (message: string): MachineTokenCommand => ({
  kind: "error",
  message: `${message}\n\n${USAGE}`,
});

export const parseMachineTokenCommand = (
  argv: readonly string[],
): MachineTokenCommand => {
  const [subcommand, ...rest] = argv;

  if (subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    return { kind: "help" };
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: [...rest],
      options: {
        name: { type: "string" },
        scope: { type: "string" },
        "expires-in-days": { type: "string" },
        username: { type: "string" },
        space: { type: "string", multiple: true },
      },
      // Strict, so an unknown flag is refused rather than ignored. A
      // `--read-only` somebody invented must not silently produce a
      // read-write token.
      strict: true,
      allowPositionals: false,
    });
  } catch (error) {
    return fail((error as Error).message);
  }

  const { values } = parsed;

  switch (subcommand) {
    case "create":
      return parseCreate(values);
    case "revoke":
      return parseRevoke(values);
    case "list":
      return parseList(values);
    case undefined:
      return fail("Say what to do: create, revoke or list.");
    default:
      return fail(`There is no "${subcommand}" command.`);
  }
};

interface RawValues {
  readonly name?: string | undefined;
  readonly scope?: string | undefined;
  readonly "expires-in-days"?: string | undefined;
  readonly username?: string | undefined;
  readonly space?: readonly string[] | undefined;
}

const parseCreate = (values: RawValues): MachineTokenCommand => {
  const name = values.name?.trim() ?? "";
  if (name.length === 0) {
    return fail("create needs --name: it is what revoking the token later uses.");
  }

  const scope = values.scope;
  if (scope === undefined) {
    // Not defaulted, on purpose. Defaulting to `read` hands somebody a token
    // that fails confusingly the first time it is asked to write; defaulting
    // to `read-write` hands out a writing credential by accident. Both are
    // worse than one more word on the command line.
    return fail(
      `create needs --scope, one of: ${MACHINE_TOKEN_SCOPES.join(", ")}.`,
    );
  }

  if (!isMachineTokenScope(scope)) {
    return fail(
      `"${scope}" is not a scope. Use one of: ${MACHINE_TOKEN_SCOPES.join(", ")}.`,
    );
  }

  const username = values.username === undefined ? null : values.username.trim();
  if (username === "") {
    // Not "absent": somebody typed the flag, and defaulting to the
    // administrator would hand the token to someone they did not name.
    return fail("--username needs the name of the person the token is for.");
  }

  const spaceIds = values.space === undefined ? null : values.space.map((id) => id.trim());
  if (spaceIds?.includes("") === true) {
    // Somebody typed the flag. Reading it as "no spaces chosen" would hand out
    // the issuer's whole reach to a token meant to be narrower.
    return fail("--space needs the id of a space the token may reach.");
  }

  const rawDays = values["expires-in-days"];
  if (rawDays === undefined) {
    return { kind: "create", name, scope, expiresInDays: null, username, spaceIds };
  }

  const days = Number(rawDays);
  if (!Number.isInteger(days) || days < 1) {
    return fail(`"${rawDays}" is not a whole number of days of at least 1.`);
  }

  return { kind: "create", name, scope, expiresInDays: days, username, spaceIds };
};

const parseRevoke = (values: RawValues): MachineTokenCommand => {
  const name = values.name?.trim() ?? "";
  if (name.length === 0) {
    // There is deliberately no "revoke everything". The one time somebody
    // reaches for it is in a panic, and the blast radius is every machine in
    // the house at once.
    return fail("revoke needs --name: it revokes exactly one token.");
  }

  if (
    values.scope !== undefined ||
    values["expires-in-days"] !== undefined ||
    values.username !== undefined ||
    values.space !== undefined
  ) {
    // Ignoring them would let somebody believe they had revoked only the read
    // half of something, which is not a thing that exists.
    return fail("revoke takes only --name.");
  }

  return { kind: "revoke", name };
};

const parseList = (values: RawValues): MachineTokenCommand => {
  if (
    values.name !== undefined ||
    values.scope !== undefined ||
    values["expires-in-days"] !== undefined ||
    values.username !== undefined ||
    values.space !== undefined
  ) {
    return fail("list takes no arguments.");
  }

  return { kind: "list" };
};
