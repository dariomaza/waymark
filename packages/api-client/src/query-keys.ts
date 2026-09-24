import type { ItemId, UnitId } from "@waymark/domain";

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
  /** What background removal is doing. Not part of the inventory graph. */
  photoProcessing: () => ["photo-processing"] as const,
  /** Where a unit's symbol IS — a URL a native `<Image>` can be pointed at. */
  qr: (id: UnitId) => ["qr", id] as const,
  /**
   * The symbol's own MARKUP, which is a different thing from its address.
   *
   * A sheet of labels is built as a document with the symbols embedded in it,
   * so it needs the SVG itself rather than somewhere to fetch it from. Keeping
   * the two apart matters: one key holding a URL on one screen and a document
   * on another is a cache that answers the wrong question the first time both
   * are on screen at once.
   */
  qrSvg: (id: UnitId) => ["qr-svg", id] as const,
  /**
   * Credentials for programs (ADR 17, ADR 18). Deliberately NOT in
   * `INVENTORY_ROOTS`: moving a box must not refetch a list of credentials,
   * and issuing one must not invalidate the forest. They are two graphs that
   * happen to share an origin.
   */
  machineTokens: () => ["machine-tokens"] as const,
  /**
   * The devices on your own account (ADR 19). Outside `INVENTORY_ROOTS` for
   * the same reason the machine tokens are: moving a box must not refetch a
   * list of credentials, and adding a device must not invalidate the forest.
   */
  passkeys: () => ["passkeys"] as const,
} as const;

/** What a change to the inventory makes stale. Used by every mutation. */
export const INVENTORY_ROOTS = [
  ["storage-units"],
  ["storage-unit"],
  ["items"],
  ["item"],
  ["search"],
];
