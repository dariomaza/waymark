import { unitId, type StorageUnit, type UnitId } from "@ariadna/domain";

import { CorruptStorageUnitHierarchy } from "../persistence/persistence-errors.js";

export interface StorageUnitTreeNode {
  readonly unit: StorageUnit;
  readonly children: readonly StorageUnitTreeNode[];
}

/**
 * Turns the flat list of units into the forest ADR 1 describes.
 *
 * Built in one pass over one `findAll`, rather than with a `findChildren` per
 * node: at homelab scale the whole inventory is a few thousand rows, and one
 * query that is shaped in memory beats N round trips that are not.
 *
 * Two edge cases are deliberate rather than incidental:
 *
 * - A unit whose parent is absent becomes a root. Dropping it would make a box
 *   disappear from the only screen that lists boxes, which is the failure
 *   somebody discovers months later while looking for the box.
 * - A stored cycle throws. ADR 2 makes cycles impossible to create; a restore
 *   from a bad backup or a manual `UPDATE` can still produce one, and rendering
 *   a tree that silently omits three units is worse than refusing to render it.
 */
export const buildStorageUnitForest = (
  units: readonly StorageUnit[],
): StorageUnitTreeNode[] => {
  const byId = new Map(units.map((unit) => [unit.id as string, unit]));
  const childrenOf = new Map<string, StorageUnit[]>();
  const roots: StorageUnit[] = [];

  for (const unit of units) {
    const parentId = unit.parentId;
    if (parentId === null || !byId.has(parentId)) {
      roots.push(unit);
      continue;
    }

    const siblings = childrenOf.get(parentId);
    if (siblings === undefined) {
      childrenOf.set(parentId, [unit]);
    } else {
      siblings.push(unit);
    }
  }

  const forest = roots
    .slice()
    .sort(bySiblingOrder)
    .map((root) => toNode(root, childrenOf));

  assertEveryUnitIsReachable(units, forest);

  return forest;
};

const toNode = (
  unit: StorageUnit,
  childrenOf: ReadonlyMap<string, StorageUnit[]>,
): StorageUnitTreeNode => ({
  unit,
  children: (childrenOf.get(unit.id) ?? [])
    .slice()
    .sort(bySiblingOrder)
    .map((child) => toNode(child, childrenOf)),
});

/**
 * Name first, id as the tie breaker. A total order matters more than the exact
 * order: without one, two reads of an unchanged inventory can come back in
 * different sequences and the UI appears to shuffle itself.
 */
const bySiblingOrder = (left: StorageUnit, right: StorageUnit): number =>
  left.name.localeCompare(right.name, "en") || left.id.localeCompare(right.id);

const assertEveryUnitIsReachable = (
  units: readonly StorageUnit[],
  forest: readonly StorageUnitTreeNode[],
): void => {
  const reachable = countNodes(forest);
  if (reachable === units.length) {
    return;
  }

  const stranded = units.find((unit) => !isInForest(unit.id, forest));

  throw new CorruptStorageUnitHierarchy(
    stranded?.id ?? unitId("unknown"),
    `${units.length - reachable} unit(s) are not reachable from any root, ` +
      `so the stored hierarchy contains a cycle`,
  );
};

const countNodes = (nodes: readonly StorageUnitTreeNode[]): number =>
  nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);

const isInForest = (
  id: UnitId,
  nodes: readonly StorageUnitTreeNode[],
): boolean =>
  nodes.some((node) => node.unit.id === id || isInForest(id, node.children));
