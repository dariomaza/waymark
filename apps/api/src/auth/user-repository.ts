import type { User } from "./user.js";

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
}
