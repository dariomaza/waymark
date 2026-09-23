import type { MachineToken as MachineTokenRow, PrismaClient } from "@prisma/client";

import {
  isMachineTokenScope,
  type MachineToken,
} from "../auth/machine-token.js";
import type {
  MachineTokenRepository,
  MachineTokenRotation,
} from "../auth/machine-token-repository.js";
import { UnknownMachineTokenScope } from "./persistence-errors.js";

/**
 * Machine tokens live in the same SQLite file as the inventory and the
 * accounts, for the reason `PrismaUserRepository` gives: a second store for a
 * handful of rows buys nothing and costs a backup that can drift from the one
 * that matters.
 */
export class PrismaMachineTokenRepository implements MachineTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * One indexed read on a unique column, on the request path.
   *
   * This is the shape the whole hashing decision rests on: the DATABASE decides
   * whether the presented hash matches, so no digest is ever compared byte by
   * byte in our code and there is no timing signal for us to have got wrong.
   */
  async findByTokenHash(tokenHash: string): Promise<MachineToken | null> {
    const row = await this.prisma.machineToken.findUnique({
      where: { tokenHash },
    });

    return row === null ? null : toDomainMachineToken(row);
  }

  async findByName(name: string): Promise<MachineToken | null> {
    const row = await this.prisma.machineToken.findUnique({ where: { name } });

    return row === null ? null : toDomainMachineToken(row);
  }

  async create(token: MachineToken): Promise<void> {
    // `create`, never `upsert`: silently replacing the secret behind a name
    // somebody is already using would revoke a live credential as a side effect
    // of a typo. The unique index decides, not a read-then-write race.
    await this.prisma.machineToken.create({ data: token });
  }

  async recordLastUsed(id: string, at: Date): Promise<void> {
    // `updateMany`, so a token revoked while one of its requests was still in
    // flight is an ordinary race rather than a 500 on the way out.
    await this.prisma.machineToken.updateMany({
      where: { id },
      data: { lastUsedAt: at },
    });
  }

  /**
   * One `UPDATE ... WHERE name = ?`, which is the whole reason this is a port
   * method rather than a delete and a create in a use case.
   *
   * SQLite applies a single statement atomically, so there is no instant at
   * which the name holds two working secrets or none. A revoke-then-create
   * would have both of those instants, and a crash inside the second one
   * leaves an operator holding nothing on the credential that was supposed to
   * be replaced.
   *
   * `scope` and `name` are absent from `data` on purpose: they are what the
   * rotation must NOT change, and leaving them out of the statement is a
   * stronger guarantee than copying them across correctly.
   */
  async rotate(rotation: MachineTokenRotation): Promise<MachineToken | null> {
    // `updateMany` rather than `update`, so a name that is not there is an
    // ordinary empty result instead of a thrown `P2025` to catch and discard —
    // the same choice `recordLastUsed` makes, for the same reason.
    const { count } = await this.prisma.machineToken.updateMany({
      where: { name: rotation.name },
      data: {
        tokenHash: rotation.tokenHash,
        createdAt: rotation.createdAt,
        expiresAt: rotation.expiresAt,
        // The secret is new, so nothing has used it yet. Saying anything else
        // would date the new credential by the old one's traffic.
        lastUsedAt: null,
      },
    });

    return count === 0 ? null : await this.findByName(rotation.name);
  }

  async deleteByName(name: string): Promise<boolean> {
    const { count } = await this.prisma.machineToken.deleteMany({
      where: { name },
    });

    return count > 0;
  }

  async list(): Promise<readonly MachineToken[]> {
    const rows = await this.prisma.machineToken.findMany({
      orderBy: { name: "asc" },
    });

    return rows.map(toDomainMachineToken);
  }
}

/**
 * `scope` is a plain string because SQLite has no enum type, so it is checked
 * rather than trusted — and checked hard, because this column is the difference
 * between a credential that may write and one that may not.
 */
const toDomainMachineToken = (row: MachineTokenRow): MachineToken => {
  if (!isMachineTokenScope(row.scope)) {
    throw new UnknownMachineTokenScope(row.id, row.scope);
  }

  return {
    id: row.id,
    name: row.name,
    tokenHash: row.tokenHash,
    scope: row.scope,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
  };
};
