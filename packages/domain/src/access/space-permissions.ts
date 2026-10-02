import type { UnitId, UserId } from "../shared/identity.js";
import { mayEditSpace, ShareLevel, type Access } from "./access.js";
import { isAtTopFor } from "./write-checks.js";

/**
 * # What a person may do with a space they can see, said before they try
 *
 * The writes refuse on their own (`write-checks.ts`); these answer the same
 * questions in advance, so a client never offers an act the API would refuse
 * (ADR 26). They are built from the very rules the writes check —
 * `mayEditSpace` and the owner-only rule at the top of the tree — so the two
 * cannot drift apart.
 */
export interface SpacePermissions {
  /** `edit` when the person may change the space and what it holds. */
  readonly access: ShareLevel;
  /** Whether it may leave where it is: edit on it, and on the place it leaves. */
  readonly mayMove: boolean;
  /**
   * Whether it may be a top-level space where it lands, which only its tree's
   * owner, or an administrator, may make. True for a root they may move, so a
   * move picker offers the top as a place it may stay.
   */
  readonly mayMoveToTop: boolean;
}

/**
 * The owner of the tree a person's visible root heads, as far as that person
 * can see: a real root names its owner, and a space shared from inside
 * somebody else's tree names nobody, because what is above it is never named.
 */
export const ownerNamedBy = (visibleRoot: {
  readonly parentId: UnitId | null;
  readonly ownerId: UserId | null;
}): UserId | null => (visibleRoot.parentId === null ? visibleRoot.ownerId : null);

/**
 * Whether the person may make a space a root, or move one that is at the top
 * of what they see: the tree's owner or an administrator, and never a token
 * narrowed to chosen spaces, whose spaces the top is outside. `refuseUnlessOwner`
 * refuses exactly when this says no.
 */
export const mayActAtTheTop = (
  access: Access,
  callerId: UserId,
  treeOwnerId: UserId | null,
): boolean =>
  access.kind === "everything" ||
  (!access.narrowed && treeOwnerId !== null && treeOwnerId === callerId);

/** Whether the person may make a new root, which is theirs (ADR 26). */
export const mayMakeRoot = (access: Access): boolean =>
  access.kind === "everything" || !access.narrowed;

/**
 * Whether a tree reached the person through a share rather than being theirs.
 * An administrator reaches everything by role, so nothing is shared with them.
 */
export const isSharedWith = (
  access: Access,
  callerId: UserId,
  treeOwnerId: UserId | null,
): boolean => access.kind === "scoped" && treeOwnerId !== callerId;

/**
 * What the person may do with one space they can see. `treeOwnerId` is what
 * `ownerNamedBy` says about the visible root the space sits under.
 */
export const permissionsOn = (
  access: Access,
  callerId: UserId,
  unit: { readonly id: UnitId; readonly parentId: UnitId | null },
  treeOwnerId: UserId | null,
): SpacePermissions => {
  const editable = mayEditSpace(access, unit.id);
  const atTop = isAtTopFor(access, unit);
  const owns = mayActAtTheTop(access, callerId, treeOwnerId);
  const mayMove =
    editable && (atTop ? owns : mayEditSpace(access, unit.parentId as UnitId));

  return {
    access: editable ? ShareLevel.EDIT : ShareLevel.VIEW,
    mayMove,
    mayMoveToTop: mayMove && owns,
  };
};
