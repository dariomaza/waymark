import { Role } from "@waymark/domain";

import type { User } from "./user.js";
import type { UserRepository } from "./user-repository.js";

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
}
