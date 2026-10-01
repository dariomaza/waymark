import {
  ShareLevel,
  unitId,
  userId,
  type Share,
  type ShareRepository,
  type UnitId,
  type UserId,
} from "@waymark/domain";
import type { PrismaClient, Share as ShareRow } from "@prisma/client";

import { UnknownShareLevel } from "./persistence-errors.js";

/**
 * Shares live beside the spaces they are on (ADR 26). The primary key is the
 * (space, person) pair, which is what makes "one share per pair" a property
 * of the table rather than of this code.
 */
export class PrismaShareRepository implements ShareRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<Share[]> {
    const rows = await this.prisma.share.findMany();

    return rows.map(toShare);
  }

  async set(share: Share): Promise<void> {
    // `upsert` on the pair: sharing again changes the level, never adds a row.
    await this.prisma.share.upsert({
      where: {
        storageUnitId_userId: {
          storageUnitId: share.storageUnitId,
          userId: share.userId,
        },
      },
      create: share,
      update: { access: share.access },
    });
  }

  async remove(storageUnitId: UnitId, userId: UserId): Promise<void> {
    // `deleteMany`, so removing what is not there is a no-op, as the port says.
    await this.prisma.share.deleteMany({ where: { storageUnitId, userId } });
  }
}

const KNOWN_LEVELS = new Set<string>(Object.values(ShareLevel));

/**
 * `access` is a plain string because SQLite has no enum, so it is checked
 * rather than trusted: it decides whether somebody may change what is shared.
 */
const toShare = (row: ShareRow): Share => {
  if (!KNOWN_LEVELS.has(row.access)) {
    throw new UnknownShareLevel(row.storageUnitId, row.userId, row.access);
  }

  return {
    storageUnitId: unitId(row.storageUnitId),
    userId: userId(row.userId),
    access: row.access as ShareLevel,
  };
};
