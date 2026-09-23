import type { Passkey as PasskeyRow, PrismaClient } from "@prisma/client";

import type { Passkey } from "../auth/passkey.js";
import type { PasskeyRepository } from "../auth/passkey-repository.js";

/**
 * Passkeys live in the same SQLite file as the inventory, the accounts and the
 * machine tokens, for the reason `PrismaUserRepository` gives: a second store
 * for a handful of rows buys nothing and costs a backup that can drift from
 * the one that matters.
 */
export class PrismaPasskeyRepository implements PasskeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * One indexed read on a unique column, on the sign-in path — and the read
   * that decides WHOSE session to open, because a discoverable-credential
   * sign-in carries no username.
   *
   * The database decides equality, so no credential id is compared byte by
   * byte in our code, which is the same property
   * `PrismaMachineTokenRepository.findByTokenHash` is careful about.
   */
  async findByCredentialId(credentialId: string): Promise<Passkey | null> {
    const row = await this.prisma.passkey.findUnique({ where: { credentialId } });

    return row === null ? null : toDomainPasskey(row);
  }

  async listForUser(userId: string): Promise<readonly Passkey[]> {
    const rows = await this.prisma.passkey.findMany({
      where: { userId },
      // Oldest first, so the list does not reshuffle between two reads and the
      // device somebody added last is the one at the bottom.
      orderBy: { createdAt: "asc" },
    });

    return rows.map(toDomainPasskey);
  }

  async create(passkey: Passkey): Promise<void> {
    // `create`, never `upsert`: a credential id arriving twice is either the
    // browser's `excludeCredentials` being ignored or somebody presenting
    // another person's, and silently replacing a row would move a credential
    // between accounts. The unique index decides, not a read-then-write race.
    await this.prisma.passkey.create({
      data: { ...passkey, transports: joinTransports(passkey.transports) },
    });
  }

  async recordUse(id: string, at: Date, signCount: number): Promise<void> {
    // `updateMany`, so a passkey removed while one of its sign-ins was still in
    // flight is an ordinary race rather than a 500 on the way out — the same
    // choice `recordLastUsed` makes for a machine token.
    await this.prisma.passkey.updateMany({
      where: { id },
      data: { lastUsedAt: at, signCount },
    });
  }

  /**
   * The owner is part of the `WHERE` rather than a check in a use case, which
   * is what makes "you may only remove your own" a property of the statement.
   *
   * `false` covers both "there is no such passkey" and "it is not yours", and
   * they are deliberately indistinguishable: an answer that told them apart
   * would confirm another person's credential to whoever guessed at its id.
   */
  async deleteFor(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.passkey.deleteMany({
      where: { id, userId },
    });

    return count > 0;
  }
}

/**
 * SQLite has no array type and this list is two short words, so it is one
 * column rather than the child table `ItemTag` is.
 *
 * That table exists because "find everything tagged `winter`" has to be an
 * indexed lookup (see `schema.prisma`). Nothing ever searches by transport:
 * the value is read back whole, handed to the browser as a hint, and never
 * queried. A child table here would be a join to rebuild a two-element array.
 *
 * The empty case is the one worth being careful about, because a browser that
 * reports no transports is ordinary: `"".split(",")` is `[""]`, which would
 * hand the platform a transport called "" and is exactly the sort of thing
 * that works everywhere except one phone.
 */
const joinTransports = (transports: readonly string[]): string =>
  transports.join(",");

const splitTransports = (stored: string): readonly string[] =>
  stored === "" ? [] : stored.split(",");

const toDomainPasskey = (row: PasskeyRow): Passkey => ({
  id: row.id,
  userId: row.userId,
  credentialId: row.credentialId,
  publicKey: row.publicKey,
  signCount: row.signCount,
  transports: splitTransports(row.transports),
  label: row.label,
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
});
