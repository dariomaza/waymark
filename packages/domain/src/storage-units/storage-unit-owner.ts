import { OutsideTokenSpaces, OwnerOnly } from "../access/access-errors.js";
import type { Access } from "../access/access.js";
import { mayActAtTheTop } from "../access/space-permissions.js";
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

/**
 * Refuses to make or move a root for anybody but the owner of the tree, or an
 * administrator (ADR 26). An editable share lets a person change everything
 * in a space, but not take it out of its owner's tree.
 */
export const refuseUnlessOwner = async (
  access: Access,
  callerId: UserId,
  storageUnits: StorageUnitRepository,
  unit: StorageUnit,
): Promise<void> => {
  if (access.kind === "everything") {
    return;
  }
  // The top of the tree is outside every space a narrowed token was given.
  if (access.narrowed) {
    throw new OutsideTokenSpaces(unit.id);
  }

  if (!mayActAtTheTop(access, callerId, await ownerOfTreeHolding(storageUnits, unit))) {
    throw new OwnerOnly(unit.id);
  }
};
