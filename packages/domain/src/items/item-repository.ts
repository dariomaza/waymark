import type { ItemId, UnitId } from "../shared/identity.js";
import type { Item } from "./item.js";

export interface ItemRepository {
  findById(id: ItemId): Promise<Item | null>;

  /** Only the items that exist; missing ids are simply absent. */
  findManyByIds(ids: readonly ItemId[]): Promise<Item[]>;

  findByStorageUnit(id: UnitId): Promise<Item[]>;

  /**
   * Every stored item, in no guaranteed order.
   *
   * This was deliberately absent for a long time, on the grounds that nothing
   * in production wants the whole item table. That stopped being true the day
   * "everything you own" became a screen: without it, the web client asked
   * one `GET /storage-units/:id` per unit and assembled the list itself,
   * which is N+1 over a home connection from a phone.
   *
   * It is the same bargain `StorageUnitRepository.findAll` already makes, one
   * level down and with a bigger N. At homelab scale — ADR 1 sizes a real
   * inventory at a handful of levels, and four hundred boxes is a few
   * thousand items — one read of a few thousand short rows beats tens of
   * round trips. The day that stops being true, `GET /items` is where it
   * shows, and this is the port that would gain a page.
   */
  findAll(): Promise<Item[]>;

  /** For the emptiness rule (ADR 3). */
  countByStorageUnit(id: UnitId): Promise<number>;

  save(item: Item): Promise<void>;

  saveAll(items: readonly Item[]): Promise<void>;

  delete(id: ItemId): Promise<void>;
}
