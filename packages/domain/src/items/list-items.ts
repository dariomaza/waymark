import type { UnitId } from "../shared/identity.js";
import type { StorageUnit } from "../storage-units/storage-unit.js";
import type { StorageUnitRepository } from "../storage-units/storage-unit-repository.js";
import type { Item } from "./item.js";
import type { ItemRepository } from "./item-repository.js";

export interface ListItemsDependencies {
  readonly items: ItemRepository;
  readonly storageUnits: StorageUnitRepository;
}

export interface ItemAtLocation {
  readonly item: Item;
  /** Root first, ending at the unit that holds it. Empty only for a lost item. */
  readonly path: readonly StorageUnit[];
}

/**
 * # Everything you own, and where each of it is
 *
 * A flat list of names is close to useless in a product whose entire purpose
 * is answering "where is it". So this is not "the items table": every row
 * carries the same breadcrumb a search hit does, for the same reason — "you
 * own a cordless drill" is something the person already knew.
 *
 * ## One read of the forest, not one walk per item
 *
 * The paths are computed here from a single `findAll` of the storage units,
 * rather than by asking `GetStorageUnitPath` per item. Forty items in one box
 * would otherwise be forty walks to the same root. ADR 1 sized the forest at
 * a handful of levels and ADR 11 already computes search scoping the same
 * way, so this is the third place that reading is the right one.
 *
 * ## Ordering is product judgement, so it lives here
 *
 * By name, then by id. The name is what somebody is scanning the screen for;
 * the id is there because without a total order two reads of an unchanged
 * inventory can come back in a different sequence, and the list appears to
 * shuffle itself under the thumb.
 *
 * ## There is no limit, and no page
 *
 * See the route: it is the same argument ADR 1, ADR 11 and ADR 12 already
 * made, and if it ever stops holding, this use case is where a page goes.
 */
export class ListItems {
  constructor(private readonly deps: ListItemsDependencies) {}

  async execute(): Promise<ItemAtLocation[]> {
    const [items, units] = await Promise.all([
      this.deps.items.findAll(),
      this.deps.storageUnits.findAll(),
    ]);

    const byId = new Map<string, StorageUnit>(units.map((unit) => [unit.id, unit]));
    const paths = new Map<string, readonly StorageUnit[]>();

    return [...items]
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name, "en") || left.id.localeCompare(right.id),
      )
      .map((item) => ({
        item,
        path: pathTo(item.storageUnitId, byId, paths),
      }));
  }
}

/**
 * Climbs to the root, memoized per unit so a box holding six items is one
 * climb. A unit that is not in the forest ends the walk: only stored data
 * contradicting itself can produce that, and answering with no path is far
 * better than losing every other item on the screen to it.
 *
 * The visited set is what makes this terminate on a tree a bad restore turned
 * into a cycle — the shape ADR 2 exists to prevent, which a reader must still
 * survive rather than hang on.
 */
const pathTo = (
  id: UnitId,
  byId: ReadonlyMap<string, StorageUnit>,
  memo: Map<string, readonly StorageUnit[]>,
): readonly StorageUnit[] => {
  const cached = memo.get(id);
  if (cached !== undefined) {
    return cached;
  }

  const path: StorageUnit[] = [];
  const visited = new Set<string>();

  let current = byId.get(id);
  while (current !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }

  memo.set(id, path);

  return path;
};
