import type { Role } from "@waymark/domain";

import type { User } from "./user.js";

/**
 * What a change that could leave the house without an active administrator
 * answers when it would have (ADR 26). Nothing was written.
 */
export const LAST_ADMINISTRATOR = "last-administrator";

/**
 * The changed account; `null` when there is no such account; or
 * `LAST_ADMINISTRATOR` when the change was refused.
 */
export type GuardedChange = User | null | typeof LAST_ADMINISTRATOR;

export interface UserRepository {
  findById(id: string): Promise<User | null>;

  /** The username must already be normalized; see `normalizeUsername`. */
  findByUsername(username: string): Promise<User | null>;

  /** Rejects when the username is taken by somebody else. */
  create(user: User): Promise<void>;

  /** Whether any account exists at all: the first one is the administrator. */
  anyoneExists(): Promise<boolean>;

  /**
   * The administrator whose account was made first, or `null` when there is
   * no administrator. Who a machine token from the CLI belongs to when nobody
   * is named.
   */
  findOldestAdministrator(): Promise<User | null>;

  /** Every account, disabled ones included, by username. */
  list(): Promise<readonly User[]>;

  /**
   * # The two changes that can take the last administrator away
   *
   * Demoting and disabling are refused when they would leave no ACTIVE
   * administrator, and that refusal is a condition of the one statement that
   * writes rather than a count read before it. Two administrators demoting
   * each other at the same instant is exactly how the last one would go, and
   * a read-then-write would let both through.
   */
  changeRole(id: string, role: Role, at: Date): Promise<GuardedChange>;

  disable(id: string, at: Date): Promise<GuardedChange>;

  /** `null` when there is no such account. */
  enable(id: string, at: Date): Promise<User | null>;

  /** The hash must already be made. `null` when there is no such account. */
  changePassword(id: string, passwordHash: string, at: Date): Promise<User | null>;
}
