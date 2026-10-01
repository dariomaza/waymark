import { Role } from "@waymark/domain";
import type { PrismaClient, User as UserRow } from "@prisma/client";

import type { User } from "../auth/user.js";
import type { UserRepository } from "../auth/user-repository.js";
import { UnknownRole } from "./persistence-errors.js";

/**
 * Accounts live in the same SQLite file as the inventory.
 *
 * A second store for four rows would buy nothing and cost a backup that can go
 * out of sync with the one that matters.
 */
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });

    return row === null ? null : toUser(row);
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { username } });

    return row === null ? null : toUser(row);
  }

  async create(user: User): Promise<void> {
    // `create`, never `upsert`: overwriting an existing account's password
    // because two admins picked the same username is not a recoverable mistake.
    // The unique index decides, not a read-then-write race in the use case.
    await this.prisma.user.create({ data: user });
  }

  async anyoneExists(): Promise<boolean> {
    return (await this.prisma.user.findFirst({ select: { id: true } })) !== null;
  }

  async findOldestAdministrator(): Promise<User | null> {
    const row = await this.prisma.user.findFirst({
      where: { role: Role.ADMINISTRATOR },
      // `id` breaks a tie, the same way the migration that made the first
      // administrator does, so the answer never depends on read order.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    return row === null ? null : toUser(row);
  }
}

const KNOWN_ROLES = new Set<string>(Object.values(Role));

/**
 * `role` is a plain string because SQLite has no enum, so it is checked rather
 * than trusted — it decides what a person may see.
 */
const toUser = (row: UserRow): User => {
  if (!KNOWN_ROLES.has(row.role)) {
    throw new UnknownRole(row.id, row.role);
  }

  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    role: row.role as Role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};
