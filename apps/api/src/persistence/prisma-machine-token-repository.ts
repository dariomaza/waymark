import type {
  MachineToken as MachineTokenRow,
  MachineTokenSpace as MachineTokenSpaceRow,
  PrismaClient,
} from "@prisma/client";
import { unitId, WHOLE_REACH } from "@waymark/domain";

import {
  isMachineTokenScope,
  type MachineToken,
} from "../auth/machine-token.js";
import {
  ANY_ISSUER,
  type IssuedBy,
  type MachineTokenRepository,
  type MachineTokenRotation,
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
      include: WITH_SPACES,
    });

    return row === null ? null : toDomainMachineToken(row);
  }

  async findByName(name: string): Promise<MachineToken | null> {
    const row = await this.prisma.machineToken.findUnique({
      where: { name },
      include: WITH_SPACES,
    });

    return row === null ? null : toDomainMachineToken(row);
  }

  async create(token: MachineToken): Promise<void> {
    // `create`, never `upsert`: silently replacing the secret behind a name
    // somebody is already using would revoke a live credential as a side effect
    // of a typo. The unique index decides, not a read-then-write race.
    // One statement with its spaces, so a narrowed token never exists, even
    // for an instant, without the spaces that narrow it.
    const { chosenSpaces, ...fields } = token;
    await this.prisma.machineToken.create({
      data: {
        ...fields,
        narrowed: chosenSpaces.narrowed,
        spaces: chosenSpaces.narrowed
          ? { create: chosenSpaces.spaceIds.map((storageUnitId) => ({ storageUnitId })) }
          : {},
      },
    });
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
  async rotate(
    rotation: MachineTokenRotation,
    issuedBy: IssuedBy,
  ): Promise<MachineToken | null> {
    // `updateMany` rather than `update`, so a name that is not there is an
    // ordinary empty result instead of a thrown `P2025` to catch and discard —
    // the same choice `recordLastUsed` makes, for the same reason.
    const { count } = await this.prisma.machineToken.updateMany({
      where: { name: rotation.name, ...whoseIs(issuedBy) },
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

  async deleteByName(name: string, issuedBy: IssuedBy): Promise<boolean> {
    const { count } = await this.prisma.machineToken.deleteMany({
      where: { name, ...whoseIs(issuedBy) },
    });

    return count > 0;
  }

  async deleteAllIssuedBy(userId: string): Promise<number> {
    const { count } = await this.prisma.machineToken.deleteMany({ where: { userId } });

    return count;
  }

  async list(): Promise<readonly MachineToken[]> {
    const rows = await this.prisma.machineToken.findMany({
      orderBy: { name: "asc" },
      include: WITH_SPACES,
    });

    return rows.map(toDomainMachineToken);
  }
}

/** The condition `issuedBy` adds to the statement that writes. */
const whoseIs = (issuedBy: IssuedBy): { userId?: string } =>
  issuedBy === ANY_ISSUER ? {} : { userId: issuedBy };

/**
 * `scope` is a plain string because SQLite has no enum type, so it is checked
 * rather than trusted — and checked hard, because this column is the difference
 * between a credential that may write and one that may not.
 */
const WITH_SPACES = { spaces: { orderBy: { storageUnitId: "asc" } } } as const;

/**
 * Narrowed when the column says so, and also when any row says so: a row
 * without the flag cannot be written through this adapter, and should one
 * appear, the reading that cannot widen a token is the one to take.
 */
const toChosenSpaces = (
  row: MachineTokenRow & { readonly spaces: readonly MachineTokenSpaceRow[] },
): MachineToken["chosenSpaces"] =>
  row.narrowed || row.spaces.length > 0
    ? { narrowed: true, spaceIds: row.spaces.map((space) => unitId(space.storageUnitId)) }
    : WHOLE_REACH;

const toDomainMachineToken = (
  row: MachineTokenRow & { readonly spaces: readonly MachineTokenSpaceRow[] },
): MachineToken => {
  if (!isMachineTokenScope(row.scope)) {
    throw new UnknownMachineTokenScope(row.id, row.scope);
  }

  return {
    id: row.id,
    name: row.name,
    tokenHash: row.tokenHash,
    scope: row.scope,
    userId: row.userId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    chosenSpaces: toChosenSpaces(row),
  };
};
