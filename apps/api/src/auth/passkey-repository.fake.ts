import type { Passkey } from "./passkey.js";
import type { PasskeyRepository } from "./passkey-repository.js";

/**
 * A real, working repository backed by a Map, for use in tests.
 *
 * It is measured against the Prisma adapter by the shared contract suite, so
 * "the fake behaves like the database" is a proven property rather than a hope.
 */
export class InMemoryPasskeyRepository implements PasskeyRepository {
  readonly #passkeys = new Map<string, Passkey>();

  constructor(passkeys: readonly Passkey[] = []) {
    for (const passkey of passkeys) {
      this.#passkeys.set(passkey.id, passkey);
    }
  }

  get size(): number {
    return this.#passkeys.size;
  }

  async findByCredentialId(credentialId: string): Promise<Passkey | null> {
    return (
      [...this.#passkeys.values()].find(
        (passkey) => passkey.credentialId === credentialId,
      ) ?? null
    );
  }

  async listForUser(userId: string): Promise<readonly Passkey[]> {
    return [...this.#passkeys.values()]
      .filter((passkey) => passkey.userId === userId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async create(passkey: Passkey): Promise<void> {
    // Rejects rather than overwrites, exactly as the unique index does. A fake
    // that quietly replaced the row would let a use case pass here and fail
    // against SQLite, which is the one thing the contract exists to stop.
    if ((await this.findByCredentialId(passkey.credentialId)) !== null) {
      throw new Error(
        `A passkey with credential id "${passkey.credentialId}" is already registered`,
      );
    }

    this.#passkeys.set(passkey.id, passkey);
  }

  async recordUse(id: string, at: Date, signCount: number): Promise<void> {
    const passkey = this.#passkeys.get(id);
    if (passkey === undefined) {
      return;
    }

    this.#passkeys.set(id, { ...passkey, lastUsedAt: at, signCount });
  }

  async deleteFor(userId: string, id: string): Promise<boolean> {
    const passkey = this.#passkeys.get(id);
    // The owner is part of the condition, not a check afterwards, so this fake
    // cannot be more permissive than the `DELETE ... WHERE` it stands in for.
    if (passkey === undefined || passkey.userId !== userId) {
      return false;
    }

    return this.#passkeys.delete(id);
  }
}
