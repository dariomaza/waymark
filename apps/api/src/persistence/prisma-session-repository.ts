import type { Session as SessionRow, PrismaClient } from "@prisma/client";

import { isSessionOpener, type Session } from "../auth/session.js";
import type { SessionRepository } from "../auth/session-repository.js";
import { UnknownSessionOpener } from "./persistence-errors.js";

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const row = await this.prisma.session.findUnique({ where: { tokenHash } });

    return row === null ? null : toDomainSession(row);
  }

  async save(session: Session): Promise<void> {
    await this.prisma.session.upsert({
      where: { id: session.id },
      create: session,
      update: session,
    });
  }

  async delete(id: string): Promise<void> {
    // `deleteMany` so logging out twice is not an error.
    await this.prisma.session.deleteMany({ where: { id } });
  }

  async deleteExpired(now: Date): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({
      where: { expiresAt: { lte: now } },
    });

    return count;
  }
}

/**
 * `createdWith` is a plain string because SQLite has no enum type, so it is
 * checked rather than trusted — and checked hard, because this column decides
 * whether the session holding it may register a passkey (ADR 19). A value
 * nobody recognises must stop the request: falling back to `password` would be
 * guessing, in the one direction that grants something.
 */
const toDomainSession = (row: SessionRow): Session => {
  if (!isSessionOpener(row.createdWith)) {
    throw new UnknownSessionOpener(row.id, row.createdWith);
  }

  return {
    id: row.id,
    tokenHash: row.tokenHash,
    userId: row.userId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    createdWith: row.createdWith,
  };
};
