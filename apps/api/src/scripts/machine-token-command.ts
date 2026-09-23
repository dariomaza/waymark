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
  | { readonly kind: "create"; readonly name: string; readonly scope: MachineTokenScope; readonly expiresInDays: number | null }
  | { readonly kind: "revoke"; readonly name: string }
  | { readonly kind: "list" }
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string };

export const USAGE = `
Usage: pnpm --filter @waymark/api machine-token <command>

  create --name <name> --scope <read|read-write> [--expires-in-days <n>]
      Issues a token and prints it ONCE. It is stored hashed and cannot be
      shown again.

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

  const rawDays = values["expires-in-days"];
  if (rawDays === undefined) {
    return { kind: "create", name, scope, expiresInDays: null };
  }

  const days = Number(rawDays);
  if (!Number.isInteger(days) || days < 1) {
    return fail(`"${rawDays}" is not a whole number of days of at least 1.`);
  }

  return { kind: "create", name, scope, expiresInDays: days };
};

const parseRevoke = (values: RawValues): MachineTokenCommand => {
  const name = values.name?.trim() ?? "";
  if (name.length === 0) {
    // There is deliberately no "revoke everything". The one time somebody
    // reaches for it is in a panic, and the blast radius is every machine in
    // the house at once.
    return fail("revoke needs --name: it revokes exactly one token.");
  }

  if (values.scope !== undefined || values["expires-in-days"] !== undefined) {
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
    values["expires-in-days"] !== undefined
  ) {
    return fail("list takes no arguments.");
  }

  return { kind: "list" };
};
