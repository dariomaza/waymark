import { DomainError } from "../shared/domain-error.js";
import type { UnitId } from "../shared/identity.js";

export class StorageUnitNotFound extends DomainError {
  constructor(readonly id: UnitId) {
    super(`Storage unit ${id} was not found`);
  }
}

/**
 * Raised when a move would put a unit inside itself or inside one of its own
 * descendants, detaching the whole group from every root (ADR 2).
 */
export class CyclicStorageUnitMove extends DomainError {
  constructor(
    readonly id: UnitId,
    readonly targetParentId: UnitId,
  ) {
    super(
      `Storage unit ${id} cannot be moved into ${targetParentId}: the target is the unit itself or one of its descendants`,
    );
  }
}

/**
 * Raised when a unit still holds items or child units (ADR 3). The counts are
 * part of the error so callers can offer "empty into parent" straight away.
 */
export class StorageUnitNotEmpty extends DomainError {
  constructor(
    readonly id: UnitId,
    readonly itemCount: number,
    readonly childUnitCount: number,
  ) {
    super(
      `Storage unit ${id} is not empty: it holds ${itemCount} item(s) and ${childUnitCount} child unit(s)`,
    );
  }
}

/**
 * Raised when a root unit still holding items is emptied without an explicit
 * target. Child units of a root simply become roots, but an item always lives
 * inside exactly one unit, so there is nowhere to put it.
 */
export class MissingEmptyTarget extends DomainError {
  constructor(
    readonly id: UnitId,
    readonly itemCount: number,
  ) {
    super(
      `Storage unit ${id} is a root and still holds ${itemCount} item(s): emptying it needs an explicit target unit`,
    );
  }
}
