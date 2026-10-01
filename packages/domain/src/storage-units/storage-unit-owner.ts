import type { UserId } from "../shared/identity.js";
import type { StorageUnit } from "./storage-unit.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

/**
 * Whose a unit is: the owner of the root at the top of its tree (ADR 26).
 *
 * Ownership is written on roots only, so a root answers for itself and any
 * other unit is answered by walking up to its root. A root with no owner is a
 * broken invariant — the database refuses to store one — so it is an error
 * rather than an answer of "nobody".
 */
export const ownerOfTreeHolding = async (
  storageUnits: StorageUnitRepository,
  unit: StorageUnit,
): Promise<UserId> => {
  const root =
    unit.parentId === null
      ? unit
      : ((await storageUnits.findAncestors(unit.id)).at(-1) ?? unit);

  if (root.ownerId === null) {
    throw new Error(
      `The tree holding storage unit ${unit.id} has no owner at its root ${root.id}; a root always has one (ADR 26)`,
    );
  }

  return root.ownerId;
};
