import type { PublicId, UnitId } from "@waymark/domain";

import type { StorageUnitTreeView, StorageUnitView } from "./contract.js";

/**
 * # Reading the forest the API answers with
 *
 * `GET /storage-units` hands back the whole tree, nested, and every screen
 * that has to ask "which unit?" needs the same flat, path-carrying view of
 * it — a move picker, a parent picker, a scanned label (ADR 12). It reads
 * only the contract, so it is shared rather than written twice: the day the
 * two clients disagree about which box a scanned code names is the day the
 * flagship feature quietly breaks on one of them.
 */
export interface FlatUnit {
  readonly unit: StorageUnitView;
  /** How deep it sits, for indenting a picker. Roots are 0. */
  readonly depth: number;
  /** `Garage > Metal wardrobe > Box 3`, ending at this unit. */
  readonly location: string;
  /**
   * The names on the way down, NOT including this unit. Empty for a root.
   *
   * Shipped beside `location` for the reason the API ships `path` beside it
   * too: a caller that wants the parts — a printed label that says the name
   * loudly and where it lives quietly — should not have to recover them by
   * splitting the joined string, which is one name containing `" > "` away
   * from being wrong.
   */
  readonly ancestry: readonly string[];
}

const SEPARATOR = " > ";

/**
 * The forest, flattened depth first, each unit carrying the path to itself.
 *
 * Every screen that has to offer "which unit?" — a move, a scan, a parent
 * picker — needs the same two things: one list, and enough of the path to
 * tell two boxes called `Box 3` apart. Computing it here once means those
 * screens cannot disagree about the order things are in.
 */
export const flattenUnits = (
  nodes: readonly StorageUnitTreeView[],
  ancestry: readonly string[] = [],
): readonly FlatUnit[] =>
  nodes.flatMap((node) => {
    const trail = [...ancestry, node.name];

    return [
      {
        unit: node,
        depth: ancestry.length,
        location: trail.join(SEPARATOR),
        ancestry,
      },
      ...flattenUnits(node.children, trail),
    ];
  });

/**
 * # Turning a scanned code into a unit
 *
 * The QR on a box encodes `<base>/u/<publicId>` and the API has no route that
 * resolves one: `publicId` ships on every unit in the tree, and the tree is
 * one request the app already makes for its own navigation.
 *
 * So the lookup happens here, over the forest already in the cache. At
 * homelab scale that is tens of units — ADR 1 sizes the tree at four or five
 * levels — and it means scanning a label costs nothing that browsing did not
 * already cost. The alternative is a new endpoint on the API; this needs no
 * change to a contract that is already shipped to two clients.
 */
export const findByPublicId = (
  nodes: readonly StorageUnitTreeView[],
  code: PublicId,
): StorageUnitView | null =>
  flattenUnits(nodes).find((entry) => entry.unit.publicId === code)?.unit ?? null;

export const findById = (
  nodes: readonly StorageUnitTreeView[],
  id: UnitId,
): StorageUnitView | null =>
  flattenUnits(nodes).find((entry) => entry.unit.id === id)?.unit ?? null;

/**
 * # Everything inside a unit, at any depth
 *
 * A location IS a storage unit (ADR 1), so "the garage" means everything
 * under it however deep, and both clients now have a question shaped like
 * that: a sheet of printed labels is chosen by ticking a room, not by ticking
 * sixty boxes one at a time.
 *
 * The unit itself is NOT included, which is the same rule `?within=` has had
 * since ADR 11: a box is not inside itself. A caller that wants the unit as
 * well says so in one line, and that line cannot be mistaken for the other
 * meaning.
 *
 * Depth first, so the answer comes out in the order the tree is drawn — which
 * is the order a sheet of labels should print in, so the labels come off the
 * scissors in the order somebody walks the room.
 */
export const subtreeOf = (
  nodes: readonly StorageUnitTreeView[],
  id: UnitId,
): readonly StorageUnitView[] => {
  const found = findNode(nodes, id);

  return found === null ? [] : flattenUnits(found.children).map((entry) => entry.unit);
};

const findNode = (
  nodes: readonly StorageUnitTreeView[],
  id: UnitId,
): StorageUnitTreeView | null => {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    const inside = findNode(node.children, id);
    if (inside !== null) {
      return inside;
    }
  }

  return null;
};
