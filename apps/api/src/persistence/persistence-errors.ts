import { DomainError, type UnitId } from "@waymark/domain";

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

/**
 * Raised when a `processingStatus` column holds something outside
 * `PhotoProcessingStatus`, or claims `DONE` with no processed path.
 *
 * Same reasoning as `UnknownStorageUnitKind`: the column is a plain string
 * because SQLite has no enum. The `DONE` case is included because a photo that
 * says it was processed and has nowhere to point is the database disagreeing
 * with itself, and `displayPathOf` would quietly fall back to the original and
 * hide it forever.
 */
export class UnknownPhotoProcessingStatus extends DomainError {
  constructor(
    readonly photoId: string,
    readonly value: string,
  ) {
    super(`Stored photo ${photoId} has an impossible processing status: "${value}"`);
  }
}

/**
 * Raised when a machine token's `scope` column holds something outside
 * `MachineTokenScope`.
 *
 * Same reasoning as `UnknownStorageUnitKind`, and sharper: this column decides
 * whether a credential may write. A value nobody recognises must stop the
 * request, never fall back to a default — "unknown, so probably read-only"
 * would be a guess about an authorization decision, and "unknown, so
 * read-write" would be that guess pointed the dangerous way.
 *
 * It is a `DomainError` rather than an `AuthError` because it says the DATABASE
 * is wrong, not the caller: an `AuthError` becomes a 401 or a 403, which would
 * blame whoever presented a perfectly good token for a row this service wrote.
 */
export class UnknownMachineTokenScope extends DomainError {
  constructor(
    readonly machineTokenId: string,
    readonly value: string,
  ) {
    super(
      `Stored machine token ${machineTokenId} has an impossible scope: "${value}"`,
    );
  }
}

/**
 * Raised when a passkey challenge's `ceremony` column holds something outside
 * `PasskeyCeremony`.
 *
 * Same reasoning as `UnknownMachineTokenScope`, and for the same reason it
 * must not fall back: the ceremony is what binds a challenge to the act it was
 * issued for, so a value nobody recognises has to stop the request rather than
 * be guessed into one of the two — and the dangerous guess here is the one
 * that lets a registration challenge finish a sign-in.
 *
 * In practice this is unreachable while `consume` names the ceremony in its
 * `WHERE`: a row with a nonsense value matches neither query. It is here for
 * the same belt-and-braces reason the others are, and because "unreachable"
 * is a property of today's queries rather than of the column.
 */
export class UnknownPasskeyCeremony extends DomainError {
  constructor(
    readonly challengeId: string,
    readonly value: string,
  ) {
    super(
      `Stored passkey challenge ${challengeId} names an impossible ceremony: "${value}"`,
    );
  }
}

/**
 * Raised when a session's `createdWith` column holds something outside
 * `SessionOpener`.
 *
 * The same reasoning as `UnknownMachineTokenScope`, pointed at the column that
 * decides whether the session holding it may register a passkey (ADR 19).
 * Falling back would be a guess about an authorization decision, and the
 * permissive value is the one a fallback would most naturally pick.
 */
export class UnknownSessionOpener extends DomainError {
  constructor(
    readonly sessionId: string,
    readonly value: string,
  ) {
    super(`Stored session ${sessionId} was opened by nothing recognisable: "${value}"`);
  }
}
