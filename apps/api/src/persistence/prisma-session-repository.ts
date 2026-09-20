import type { PrismaClient } from "@prisma/client";

import type { Session } from "../auth/session.js";
import type { SessionRepository } from "../auth/session-repository.js";

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { tokenHash } });
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
