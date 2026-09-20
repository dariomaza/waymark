import type { ItemId, UnitId } from "@ariadna/domain";

/**
 * Every cache key in one place.
 *
 * The inventory is one graph — moving an item changes two units and the
 * search results at once — so the keys that have to be invalidated together
 * are written down together. Spread across features, they drift, and a stale
 * screen after a move is exactly the kind of bug nobody reports because it
 * looks like they mis-tapped.
 */
export const queryKeys = {
  session: (token: string) => ["session", token] as const,
  /** The whole forest. Every mutation on a unit touches it. */
  tree: () => ["storage-units"] as const,
  unit: (id: UnitId) => ["storage-unit", id] as const,
  /** Everything you own, in one request rather than one per unit. */
  items: () => ["items"] as const,
  item: (id: ItemId) => ["item", id] as const,
  search: (query: string, within: UnitId | null, limit: number | undefined) =>
    ["search", query, within, limit] as const,
  photo: (url: string) => ["photo", url] as const,
  qr: (id: UnitId) => ["qr", id] as const,
} as const;

/** What a change to the inventory makes stale. Used by every mutation. */
export const INVENTORY_ROOTS = [
  ["storage-units"],
  ["storage-unit"],
  ["items"],
  ["item"],
  ["search"],
];
