import { Role } from "@waymark/domain";

import { isActive, type User } from "./user.js";
import {
  LAST_ADMINISTRATOR,
  type GuardedChange,
  type UserRepository,
} from "./user-repository.js";

/**
 * A real, working repository backed by a Map, measured against the Prisma
 * adapter by `user-repository.contract.ts`.
 */
export class InMemoryUserRepository implements UserRepository {
  readonly #users = new Map<string, User>();

  constructor(users: readonly User[] = []) {
    for (const user of users) {
      this.#users.set(user.id, user);
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.#users.get(id) ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    return (
      [...this.#users.values()].find((user) => user.username === username) ??
      null
    );
  }

  async create(user: User): Promise<void> {
    // Rejects, exactly as the unique index does.
    if ((await this.findByUsername(user.username)) !== null) {
      throw new Error(`The username "${user.username}" is already taken`);
    }

    this.#users.set(user.id, user);
  }

  async anyoneExists(): Promise<boolean> {
    return this.#users.size > 0;
  }

  async findOldestAdministrator(): Promise<User | null> {
    const administrators = [...this.#users.values()]
      .filter((user) => user.role === Role.ADMINISTRATOR)
      .sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id),
      );

    return administrators[0] ?? null;
  }

  async list(): Promise<readonly User[]> {
    return [...this.#users.values()].sort((left, right) =>
      left.username.localeCompare(right.username),
    );
  }

  async changeRole(id: string, role: Role, at: Date): Promise<GuardedChange> {
    return this.#guarded(id, role === Role.USER, (user) => ({
      ...user,
      role,
      updatedAt: at,
    }));
  }

  async disable(id: string, at: Date): Promise<GuardedChange> {
    return this.#guarded(id, true, (user) => ({
      ...user,
      disabledAt: user.disabledAt ?? at,
      updatedAt: at,
    }));
  }

  async enable(id: string, at: Date): Promise<User | null> {
    return this.#change(id, (user) => ({ ...user, disabledAt: null, updatedAt: at }));
  }

  async changePassword(
    id: string,
    passwordHash: string,
    at: Date,
  ): Promise<User | null> {
    return this.#change(id, (user) => ({ ...user, passwordHash, updatedAt: at }));
  }

  /**
   * `takesAway` says whether the change would stop this account counting as
   * an active administrator; when it would and nobody else does, nothing is
   * written. The same condition the Prisma adapter puts in its statement.
   */
  #guarded(
    id: string,
    takesAway: boolean,
    apply: (user: User) => User,
  ): GuardedChange {
    const user = this.#users.get(id);
    if (user === undefined) {
      return null;
    }

    const anotherRemains = [...this.#users.values()].some(
      (other) =>
        other.id !== id && other.role === Role.ADMINISTRATOR && isActive(other),
    );
    if (
      takesAway &&
      user.role === Role.ADMINISTRATOR &&
      isActive(user) &&
      !anotherRemains
    ) {
      return LAST_ADMINISTRATOR;
    }

    return this.#change(id, apply);
  }

  #change(id: string, apply: (user: User) => User): User | null {
    const user = this.#users.get(id);
    if (user === undefined) {
      return null;
    }

    const changed = apply(user);
    this.#users.set(id, changed);

    return changed;
  }
}
