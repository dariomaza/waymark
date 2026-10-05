import type { Role } from "@waymark/domain";

/**
 * An account: a person, the way they get in, and their role (ADR 26).
 *
 * The role is a domain value because what it decides — what a person may see
 * and change — is a statement about boxes. The account itself stays here, in
 * `@waymark/api`, because the credentials are not.
 */
export interface User {
  readonly id: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /**
   * When an administrator disabled the account, or `null` while it is active
   * (ADR 26). A disabled account keeps its row, its inventory and its
   * passkeys, and opens nothing: every way in checks this, not only the
   * deletions that came with it.
   */
  readonly disabledAt: Date | null;
  /**
   * Whether the password is a temporary one an administrator's request
   * generated (ADR 26, amended). While it is set, the account is restricted:
   * a session of it may read who it is, sign out and change the password,
   * and nothing else. Choosing a password of their own clears it.
   */
  readonly mustChangePassword: boolean;
}

/** Whether this account may get in at all. */
export const isActive = (user: User): boolean => user.disabledAt === null;

/**
 * Usernames are compared lower case and stored lower case.
 *
 * `Dario` and `dario` being two accounts is a support problem, and doing it
 * with a case insensitive collation would behave differently on SQLite and on
 * the Postgres docs/architecture.md expects one day.
 */
export const normalizeUsername = (raw: string): string =>
  raw.trim().toLowerCase();
