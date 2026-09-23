import type {
  PasskeyChallenge as PasskeyChallengeRow,
  PrismaClient,
} from "@prisma/client";

import {
  isPasskeyCeremony,
  type PasskeyCeremony,
  type PasskeyChallenge,
} from "../auth/passkey-challenge.js";
import type { PasskeyChallengeRepository } from "../auth/passkey-challenge-repository.js";
import { UnknownPasskeyCeremony } from "./persistence-errors.js";

export class PrismaPasskeyChallengeRepository
  implements PasskeyChallengeRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async create(challenge: PasskeyChallenge): Promise<void> {
    await this.prisma.passkeyChallenge.create({ data: challenge });
  }

  /**
   * # One statement, and that is the whole guarantee
   *
   * `deleteMany` with every condition in the `WHERE`: the id, the ceremony it
   * was issued for, and an expiry that has not passed. SQLite applies it
   * atomically, so of two callers racing the same ceremony exactly one gets a
   * `count` of 1 and the other gets 0 — which is the single-use property this
   * table exists for, decided by the database rather than by the order two
   * promises happened to resolve in.
   *
   * ## Why the row is read first, and why that is not a race
   *
   * `deleteMany` answers a count and not the row, and the caller needs the
   * challenge itself to verify against. So this reads, then deletes, and
   * **returns the read only when the delete removed something.** A second
   * caller may read the same row — and will then delete nothing, and be handed
   * `null`. The read is not the decision; the delete is.
   *
   * `delete` with a unique `where` would have answered the row in one call and
   * would have had to be wrapped in a try/catch for `P2025`, and — worse — it
   * cannot carry the ceremony and expiry conditions, because those are not
   * part of any unique constraint. A predicate that cannot be in the statement
   * is a rule somebody has to remember.
   */
  async consume(
    id: string,
    ceremony: PasskeyCeremony,
    now: Date,
  ): Promise<PasskeyChallenge | null> {
    const row = await this.prisma.passkeyChallenge.findUnique({ where: { id } });
    if (row === null) {
      return null;
    }

    const { count } = await this.prisma.passkeyChallenge.deleteMany({
      where: { id, ceremony, expiresAt: { gt: now } },
    });

    return count === 0 ? null : toDomainPasskeyChallenge(row);
  }

  async deleteExpired(now: Date): Promise<number> {
    const { count } = await this.prisma.passkeyChallenge.deleteMany({
      where: { expiresAt: { lte: now } },
    });

    return count;
  }
}

const toDomainPasskeyChallenge = (
  row: PasskeyChallengeRow,
): PasskeyChallenge => {
  if (!isPasskeyCeremony(row.ceremony)) {
    throw new UnknownPasskeyCeremony(row.id, row.ceremony);
  }

  return {
    id: row.id,
    ceremony: row.ceremony,
    challenge: row.challenge,
    userId: row.userId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
};
