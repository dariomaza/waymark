import type { PublicId, UnitId } from "@ariadna/domain";

import type { StorageUnitTreeView, StorageUnitView } from "../api/contract.js";

export interface FlatUnit {
  readonly unit: StorageUnitView;
  /** How deep it sits, for indenting a picker. Roots are 0. */
  readonly depth: number;
  /** `Garage > Metal wardrobe > Box 3`, ending at this unit. */
  readonly location: string;
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
      { unit: node, depth: ancestry.length, location: trail.join(SEPARATOR) },
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
