import { Role } from "@waymark/domain";
import { Prisma, type PrismaClient, type User as UserRow } from "@prisma/client";

import type { User } from "../auth/user.js";
import {
  LAST_ADMINISTRATOR,
  type GuardedChange,
  type UserRepository,
} from "../auth/user-repository.js";
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

  async list(): Promise<readonly User[]> {
    const rows = await this.prisma.user.findMany({ orderBy: { username: "asc" } });

    return rows.map(toUser);
  }

  /**
   * Promoting is never refused. Demoting is a statement that writes only if
   * the account is not an active administrator or another active one remains,
   * so the rule and the write cannot be separated by anything (ADR 26).
   */
  async changeRole(id: string, role: Role, at: Date): Promise<GuardedChange> {
    if (role === Role.ADMINISTRATOR) {
      return this.#update(id, { role, updatedAt: at });
    }

    const written = await this.prisma.$executeRaw`
      UPDATE "User" SET "role" = ${role}, "updatedAt" = ${at}
      WHERE "id" = ${id} AND (${KEEPS_AN_ADMINISTRATOR(id)})
    `;

    return this.#guardedAnswer(id, written);
  }

  /**
   * The same guard as a demotion. A disable that is repeated keeps the first
   * moment: that is when the account stopped opening anything.
   */
  async disable(id: string, at: Date): Promise<GuardedChange> {
    const written = await this.prisma.$executeRaw`
      UPDATE "User" SET "disabledAt" = COALESCE("disabledAt", ${at}), "updatedAt" = ${at}
      WHERE "id" = ${id} AND (${KEEPS_AN_ADMINISTRATOR(id)})
    `;

    return this.#guardedAnswer(id, written);
  }

  async enable(id: string, at: Date): Promise<User | null> {
    return this.#update(id, { disabledAt: null, updatedAt: at });
  }

  async changePassword(
    id: string,
    passwordHash: string,
    at: Date,
  ): Promise<User | null> {
    return this.#update(id, { passwordHash, updatedAt: at });
  }

  async #update(
    id: string,
    data: { role?: string; passwordHash?: string; disabledAt?: null; updatedAt: Date },
  ): Promise<User | null> {
    const { count } = await this.prisma.user.updateMany({ where: { id }, data });

    return count === 0 ? null : this.findById(id);
  }

  /** Nothing written means either nobody by that id, or the guard said no. */
  async #guardedAnswer(id: string, written: number): Promise<GuardedChange> {
    const user = await this.findById(id);
    if (user === null) {
      return null;
    }

    return written === 0 ? LAST_ADMINISTRATOR : user;
  }
}

/**
 * True when changing this account cannot take the last active administrator
 * away: it is not an active administrator, or another active one exists.
 */
const KEEPS_AN_ADMINISTRATOR = (id: string): Prisma.Sql => Prisma.sql`
  "role" <> ${Role.ADMINISTRATOR}
  OR "disabledAt" IS NOT NULL
  OR EXISTS (
    SELECT 1 FROM "User" AS "other"
    WHERE "other"."id" <> ${id}
      AND "other"."role" = ${Role.ADMINISTRATOR}
      AND "other"."disabledAt" IS NULL
  )
`;

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
    disabledAt: row.disabledAt,
  };
};
