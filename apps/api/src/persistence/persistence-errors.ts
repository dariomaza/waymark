import { DomainError, type UnitId } from "@ariadna/domain";

/**
 * Raised when the stored storage unit tree is not a tree.
 *
 * ADR 2 makes cycles impossible to CREATE through the use cases. It cannot make
 * them impossible to EXIST: a restore from a bad backup, a manual `UPDATE`, or
 * a future bug can all close a loop that no foreign key would object to. When
 * that happens the ancestor walk must stop and say so.
 *
 * It is a `DomainError` rather than an infrastructure error on purpose. The
 * hierarchy being acyclic is a domain invariant, so a caller that already
 * distinguishes rule violations from crashes with one `instanceof DomainError`
 * check keeps working, and the API surfaces a diagnosable 4xx/5xx instead of a
 * driver stack trace.
 */
export class CorruptStorageUnitHierarchy extends DomainError {
  constructor(
    readonly id: UnitId,
    readonly reason: string,
  ) {
    super(
      `The stored storage unit hierarchy above ${id} is corrupt: ${reason}. ` +
        `The ancestor walk was stopped instead of being allowed to loop.`,
    );
  }
}

/**
 * Raised when a `kind` column holds something outside `StorageUnitKind`.
 *
 * SQLite has no enum type, so the column is a plain string. Trusting it blindly
 * would smuggle an invalid value into a `StorageUnit` that the domain's types
 * promise cannot exist.
 */
export class UnknownStorageUnitKind extends DomainError {
  constructor(readonly value: string) {
    super(`Stored storage unit kind "${value}" is not a known kind`);
  }
}
