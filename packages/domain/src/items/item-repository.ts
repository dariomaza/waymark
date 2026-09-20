import type { ItemId, UnitId } from "../shared/identity.js";
import type { Item } from "./item.js";

export interface ItemRepository {
  findById(id: ItemId): Promise<Item | null>;

  /** Only the items that exist; missing ids are simply absent. */
  findManyByIds(ids: readonly ItemId[]): Promise<Item[]>;

  findByStorageUnit(id: UnitId): Promise<Item[]>;

  /** For the emptiness rule (ADR 3). */
  countByStorageUnit(id: UnitId): Promise<number>;

  save(item: Item): Promise<void>;

  saveAll(items: readonly Item[]): Promise<void>;

  delete(id: ItemId): Promise<void>;
}
