import type { UnitId, UserId } from "../shared/identity.js";
import type { Share, ShareRepository } from "./share-repository.js";

/**
 * A real, working repository backed by a Map, measured against the Prisma
 * adapter by the shared contract suite.
 */
export class InMemoryShareRepository implements ShareRepository {
  readonly #shares = new Map<string, Share>();

  async findAll(): Promise<Share[]> {
    return [...this.#shares.values()];
  }

  async set(share: Share): Promise<void> {
    // Keyed by the pair, exactly as the database's primary key is, so a second
    // share of the same space with the same person replaces the first.
    this.#shares.set(`${share.storageUnitId}/${share.userId}`, share);
  }

  async remove(storageUnitId: UnitId, userId: UserId): Promise<void> {
    this.#shares.delete(`${storageUnitId}/${userId}`);
  }
}
