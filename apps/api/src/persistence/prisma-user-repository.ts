import type { PrismaClient } from "@prisma/client";

import type { User } from "../auth/user.js";
import type { UserRepository } from "../auth/user-repository.js";

/**
 * Accounts live in the same SQLite file as the inventory.
 *
 * A second store for four rows would buy nothing and cost a backup that can go
 * out of sync with the one that matters.
 */
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async create(user: User): Promise<void> {
    // `create`, never `upsert`: overwriting an existing account's password
    // because two admins picked the same username is not a recoverable mistake.
    // The unique index decides, not a read-then-write race in the use case.
    await this.prisma.user.create({ data: user });
  }
}
