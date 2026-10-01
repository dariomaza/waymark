import type { MachineToken } from "./machine-token.js";
import {
  ANY_ISSUER,
  type IssuedBy,
  type MachineTokenRepository,
  type MachineTokenRotation,
} from "./machine-token-repository.js";

const isIssuedBy = (token: MachineToken, issuedBy: IssuedBy): boolean =>
  issuedBy === ANY_ISSUER || token.userId === issuedBy;

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

  /**
   * One `Map.set` over the row that is already there, which is what makes it
   * the single step the port promises: the old hash and the new one are never
   * both live, and there is no moment in which the name holds nothing.
   *
   * `id`, `name` and `scope` are taken from the stored row rather than from
   * the rotation, so a caller cannot widen a scope through this door.
   */
  async rotate(
    rotation: MachineTokenRotation,
    issuedBy: IssuedBy,
  ): Promise<MachineToken | null> {
    const stored = await this.findByName(rotation.name);
    if (stored === null || !isIssuedBy(stored, issuedBy)) {
      return null;
    }

    const rotated: MachineToken = {
      id: stored.id,
      name: stored.name,
      scope: stored.scope,
      tokenHash: rotation.tokenHash,
      userId: stored.userId,
      createdAt: rotation.createdAt,
      expiresAt: rotation.expiresAt,
      // Never carried over: it would describe a secret that no longer exists.
      lastUsedAt: null,
      // Kept, as the scope is: a rotation is a new secret for the same key.
      chosenSpaces: stored.chosenSpaces,
    };
    this.#tokens.set(stored.id, rotated);

    return rotated;
  }

  async deleteByName(name: string, issuedBy: IssuedBy): Promise<boolean> {
    const token = await this.findByName(name);
    if (token === null || !isIssuedBy(token, issuedBy)) {
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
