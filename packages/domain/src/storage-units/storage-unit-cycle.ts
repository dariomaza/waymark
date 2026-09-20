import type { UnitId } from "../shared/identity.js";
import {
  CyclicStorageUnitMove,
  StorageUnitNotFound,
} from "./storage-unit-errors.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

/**
 * The cycle invariant of ADR 2, expressed over the subtree rather than over the
 * direct parent:
 *
 * > The new parent of a unit must be neither the unit itself nor any of its
 * > descendants.
 *
 * `targetParentId !== id` is NOT this rule. It passes a three-node cycle
 * (room -> wardrobe -> box, then room into box), which detaches all three units
 * from every root and makes breadcrumb walking non-terminating.
 *
 * The check walks the ancestor chain of the TARGET PARENT, which is bounded by
 * tree depth and loads no subtree. If the moved unit appears in that chain, the
 * target sits below it and the move would close a loop.
 */
export const assertStorageUnitMoveIsAcyclic = async (
  storageUnits: StorageUnitRepository,
  id: UnitId,
  targetParentId: UnitId | null,
): Promise<void> => {
  // Making a unit a root can never close a loop (ADR 2).
  if (targetParentId === null) {
    return;
  }

  const targetParent = await storageUnits.findById(targetParentId);
  if (targetParent === null) {
    throw new StorageUnitNotFound(targetParentId);
  }

  if (targetParentId === id) {
    throw new CyclicStorageUnitMove(id, targetParentId);
  }

  const targetAncestors = await storageUnits.findAncestors(targetParentId);
  if (targetAncestors.some((ancestor) => ancestor.id === id)) {
    throw new CyclicStorageUnitMove(id, targetParentId);
  }
};
