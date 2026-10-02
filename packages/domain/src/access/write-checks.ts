import { SpaceIsViewOnly } from "./access-errors.js";
import { mayEditSpace, mayViewSpace, type Access } from "./access.js";
import type { UnitId } from "../shared/identity.js";

/**
 * # The order every write checks in (ADR 26)
 *
 * 1. **Can every target be seen?** A space or item out of reach is refused
 *    exactly as a missing one, with the same error, before anything else is
 *    looked at.
 * 2. **May every target be changed?** A view share refuses with
 *    `SpaceIsViewOnly`, and taking something to or from the top of the tree
 *    needs its owner (`OwnerOnly`).
 * 3. **Only then the domain's own refusals:** not empty, a cycle, a bad
 *    quantity, a full item.
 *
 * So a refusal never says anything about a space the person may not see:
 * "this box is not empty" about Ana's safe would tell Bea that it exists.
 */

/** Refuses a space the person may see but not change. */
export const refuseViewOnly = (access: Access, id: UnitId): void => {
  if (!mayEditSpace(access, id)) {
    throw new SpaceIsViewOnly(id);
  }
};

/**
 * Whether a space is at the top of what the person may see: a root, or a
 * space whose parent is out of their reach. Either way, for that person there
 * is nothing above it, and nothing above it may be named.
 */
export const isAtTopFor = (
  access: Access,
  unit: { readonly parentId: UnitId | null },
): boolean => unit.parentId === null || !mayViewSpace(access, unit.parentId);
