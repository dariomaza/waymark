/**
 * A named, long-lived credential that is not a person.
 *
 * ## Why this is not a `User`
 *
 * An MCP server reading the inventory so an assistant can answer "which box is
 * the drill in" needs a way in. Today the only way in is a username and a
 * password, which means putting a household member's password in an
 * environment file: it cannot be revoked without changing that person's
 * password, it grants everything that person can do, and nothing anywhere
 * records that a machine — rather than the person — has been using it.
 *
 * A machine token answers all three. It is revoked on its own, it can be
 * narrower than the person who issued it, and it records when it was last used.
 *
 * ## Why there is no `userId` on it
 *
 * Because there is nothing to put there that would mean anything. ADR 5 says
 * users are credentials and the inventory is shared; a machine token is another
 * credential against that same shared inventory, not a delegation of one
 * person's access. Storing "dario issued this" would be provenance, and
 * provenance that nothing reads is a column that goes stale — the `name` is
 * where a human says what the token is for, and it is the field revocation is
 * keyed by.
 */
export interface MachineToken {
  readonly id: string;
  /**
   * What this token is FOR, in a human's words: `mcp-server`, `backup`. It is
   * unique, because it is what `machine-token revoke` names.
   */
  readonly name: string;
  /** SHA-256 of the token. The token itself is shown once and never stored. */
  readonly tokenHash: string;
  readonly scope: MachineTokenScope;
  readonly createdAt: Date;
  /**
   * `null` means it never lapses, which is the normal case and the point of
   * the thing: a credential in a compose file that stops working on a Tuesday
   * for no reason a person can see is worse than one that is revoked on
   * purpose. An expiry is available for a token issued for a known job.
   */
  readonly expiresAt: Date | null;
  /**
   * `null` until it is first presented. This is the field that makes an
   * abandoned credential visible: one nobody can see being used is one nobody
   * will ever think to revoke.
   *
   * It is deliberately COARSE. See `LAST_USED_GRANULARITY_MS`.
   */
  readonly lastUsedAt: Date | null;
}

/**
 * What a machine token may do. Two values, and there will not be a third.
 *
 * `read` exists because the thing holding the credential is not a person and
 * cannot be asked to be careful: an assistant that has been talked into
 * emptying a storage unit is a real failure mode, and a read-only key makes it
 * impossible rather than unlikely. `read-write` exists because some machine
 * will eventually need to file something away.
 *
 * Anything past those two — "may delete", "may touch the garage only" — is the
 * role system ADR 5 refused, and ADR 17 says why the line is here and not there.
 */
export const MachineTokenScope = {
  Read: "read",
  ReadWrite: "read-write",
} as const;

export type MachineTokenScope =
  (typeof MachineTokenScope)[keyof typeof MachineTokenScope];

/** In the order the CLI prints them, and the order the ADR argues them. */
export const MACHINE_TOKEN_SCOPES: readonly MachineTokenScope[] = [
  MachineTokenScope.Read,
  MachineTokenScope.ReadWrite,
];

/**
 * SQLite has no enum type and the column is a string, exactly as
 * `StorageUnit.kind` is, so the value is checked on the way OUT of the database
 * rather than trusted.
 */
export const isMachineTokenScope = (
  candidate: string,
): candidate is MachineTokenScope =>
  (MACHINE_TOKEN_SCOPES as readonly string[]).includes(candidate);

/**
 * The whole authorization rule, in one line, with no route in sight.
 *
 * Which HTTP methods count as a write is a transport question and lives in the
 * HTTP layer; whether THIS caller may write is a question about the credential
 * and lives here, where it can be read without a Fastify instance.
 */
export const mayWriteWith = (scope: MachineTokenScope): boolean =>
  scope === MachineTokenScope.ReadWrite;

/**
 * Names are compared lower case and stored lower case, for the same reason
 * usernames are (`user.ts`): two tokens called `MCP` and `mcp` would make
 * `machine-token revoke --name mcp` a coin toss, and revocation is the one
 * operation on this credential that must never be ambiguous.
 */
export const normalizeMachineTokenName = (raw: string): string =>
  raw.trim().toLowerCase();

/**
 * How stale `lastUsedAt` is allowed to be: one hour.
 *
 * Recording it on every request would turn every authenticated READ by a
 * machine into a write on a single SQLite file — and a machine is the one
 * caller that reads in a loop, so this is a much sharper version of the problem
 * `SESSION_RENEW_AFTER_MS` already solves for people. An assistant walking a
 * forty-box inventory would issue a write per box.
 *
 * An hour rather than the session's day, because the two answer different
 * questions. A session's renewal only has to beat a 30-day expiry, so a day is
 * free. `lastUsedAt` is read by a human asking "is anything still using this
 * token, or can I kill it", and "some time yesterday" is a worse answer to that
 * than "within the last hour" by enough to matter. An hour bounds the cost at
 * 24 writes per token per day, which is nothing next to one photo upload.
 */
export const LAST_USED_GRANULARITY_MS = 60 * 60 * 1000;
