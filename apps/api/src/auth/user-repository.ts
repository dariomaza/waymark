import type { User } from "./user.js";

export interface UserRepository {
  findById(id: string): Promise<User | null>;

  /** The username must already be normalized; see `normalizeUsername`. */
  findByUsername(username: string): Promise<User | null>;

  /** Rejects when the username is taken by somebody else. */
  create(user: User): Promise<void>;
}
