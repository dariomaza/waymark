import { DomainError } from "../shared/domain-error.js";
import type { UnitId } from "../shared/identity.js";

/**
 * Raised when a person may see a space but may not change it, or anything in
 * it, because it was shared with them to view (ADR 26).
 *
 * They already know the space exists, so this is a refusal of authority and
 * not a pretence that it is missing. `storageUnitId` is the space that stops
 * the write: the one being changed, the one something is put into or taken
 * out of, or the one holding the item being changed.
 */
export class SpaceIsViewOnly extends DomainError {
  constructor(readonly storageUnitId: UnitId) {
    super(
      `Storage unit ${storageUnitId} is shared with you to view only; changing it, or anything in it, needs edit`,
    );
  }
}

/**
 * Raised when somebody who may edit a space tries to take it, or what it
 * holds, to the top of the tree, or to take a space at the top of what they
 * see somewhere else (ADR 26).
 *
 * Only the owner of the tree, or an administrator, may make or move a root.
 * Otherwise an editable share would be a way to take what was shared: out of
 * the owner's sight as a root, or into one's own tree. `storageUnitId` is the
 * space that would have become or stopped being a root.
 */
export class OwnerOnly extends DomainError {
  constructor(readonly storageUnitId: UnitId) {
    super(
      `Only the owner of the tree holding storage unit ${storageUnitId}, or an administrator, may make it a root or move it from the top`,
    );
  }
}

/**
 * Raised when a machine token narrowed to chosen spaces tries to act at the
 * top of the tree, which is outside every space chosen for it (ADR 26): to
 * make a root, or to move a space to or from the top.
 *
 * Its issuer may own the tree and be free to do it. The token is narrower
 * than its issuer on purpose, so it is refused for authority, like a view
 * share. `storageUnitId` is the space that would have become or stopped
 * being a root, or `null` for a root that would have been made.
 */
export class OutsideTokenSpaces extends DomainError {
  constructor(readonly storageUnitId: UnitId | null) {
    super(
      storageUnitId === null
        ? "This machine token is narrowed to chosen spaces, and a new root would be outside them"
        : `This machine token is narrowed to chosen spaces, and moving storage unit ${storageUnitId} to or from the top of the tree would act outside them`,
    );
  }
}
