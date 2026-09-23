import type { MachineToken } from "./machine-token.js";
import type { MachineTokenRepository } from "./machine-token-repository.js";

/**
 * A real, working repository backed by a Map, for use in tests.
 *
 * It is measured against the Prisma adapter by the shared contract suite, so
 * "the fake behaves like the database" is a proven property rather than a hope.
 */
export class InMemoryMachineTokenRepository implements MachineTokenRepository {
  readonly #tokens = new Map<string, MachineToken>();

  constructor(tokens: readonly MachineToken[] = []) {
    for (const token of tokens) {
      this.#tokens.set(token.id, token);
    }
  }

  get size(): number {
    return this.#tokens.size;
  }

  async findByTokenHash(tokenHash: string): Promise<MachineToken | null> {
    return (
      [...this.#tokens.values()].find(
        (token) => token.tokenHash === tokenHash,
      ) ?? null
    );
  }

  async findByName(name: string): Promise<MachineToken | null> {
    return (
      [...this.#tokens.values()].find((token) => token.name === name) ?? null
    );
  }

  async create(token: MachineToken): Promise<void> {
    // Rejects rather than overwrites, exactly as the unique index does. A fake
    // that quietly replaced the row would let a use case pass here and fail
    // against SQLite, which is the one thing the contract exists to stop.
    if ((await this.findByName(token.name)) !== null) {
      throw new Error(`A machine token named "${token.name}" already exists`);
    }

    this.#tokens.set(token.id, token);
  }

  async recordLastUsed(id: string, at: Date): Promise<void> {
    const token = this.#tokens.get(id);
    if (token === undefined) {
      return;
    }

    this.#tokens.set(id, { ...token, lastUsedAt: at });
  }

  async deleteByName(name: string): Promise<boolean> {
    const token = await this.findByName(name);
    if (token === null) {
      return false;
    }

    return this.#tokens.delete(token.id);
  }

  async list(): Promise<readonly MachineToken[]> {
    return [...this.#tokens.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }
}
