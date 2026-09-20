import type { ItemId, UnitId } from "../shared/identity.js";
import type { Item } from "./item.js";
import type { ItemRepository } from "./item-repository.js";

/** A real, working repository backed by a Map, for use in tests. */
export class InMemoryItemRepository implements ItemRepository {
  readonly #items = new Map<string, Item>();

  constructor(items: readonly Item[] = []) {
    for (const item of items) {
      this.#items.set(item.id, item);
    }
  }

  get size(): number {
    return this.#items.size;
  }

  /**
   * Every stored item. Deliberately NOT on the port: nothing in production
   * ever wants the whole item table, and an adapter that offered it would be
   * an invitation to load a homelab's entire inventory into memory. The
   * in-memory search repository reads it because it IS the storage.
   */
  get all(): Item[] {
    return [...this.#items.values()];
  }

  async findById(id: ItemId): Promise<Item | null> {
    return this.#items.get(id) ?? null;
  }

  async findManyByIds(ids: readonly ItemId[]): Promise<Item[]> {
    return ids
      .map((id) => this.#items.get(id))
      .filter((item): item is Item => item !== undefined);
  }

  async findByStorageUnit(id: UnitId): Promise<Item[]> {
    return [...this.#items.values()].filter(
      (item) => item.storageUnitId === id,
    );
  }

  async countByStorageUnit(id: UnitId): Promise<number> {
    return (await this.findByStorageUnit(id)).length;
  }

  async save(item: Item): Promise<void> {
    this.#items.set(item.id, item);
  }

  async saveAll(items: readonly Item[]): Promise<void> {
    for (const item of items) {
      this.#items.set(item.id, item);
    }
  }

  async delete(id: ItemId): Promise<void> {
    this.#items.delete(id);
  }
}
