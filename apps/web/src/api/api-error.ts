/**
 * Every refusal the API can produce, in the one shape the whole client
 * branches on.
 *
 * `code` is the contract — `STORAGE_UNIT_NOT_EMPTY`, `CYCLIC_STORAGE_UNIT_MOVE`
 * — and `details` is what the caller needs in order to do something about it,
 * such as how many things are still in the box. The message is for a log; a
 * screen writes its own sentence.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * # Why a call failed, at the level a screen can act on
 *
 * ADR 8 draws the line this app has to render: **409 means fix the world** —
 * the same request works once somebody empties the box or moves the target out
 * of the subtree — and **422 means fix the request**, where nothing anybody
 * else does will help. Those are two different sentences and two different
 * affordances: one offers a button that changes the world, the other puts the
 * cursor back in a field.
 *
 * Collapsing every failure into "something went wrong" would throw away the
 * most carefully made decision in the API.
 */
export const FailureKind = {
  /** The request never left the phone. */
  OFFLINE: "OFFLINE",
  /** The session is gone or was refused. */
  UNAUTHENTICATED: "UNAUTHENTICATED",
  /** The URL points at something that is not there. */
  NOT_FOUND: "NOT_FOUND",
  /** Refused by the state of the world, and the world can be changed. */
  CONFLICT: "CONFLICT",
  /** Refused by the request itself. Change the request. */
  INVALID: "INVALID",
  /** Too many attempts, too quickly. */
  RATE_LIMITED: "RATE_LIMITED",
  /** The server broke, or answered something this client cannot read. */
  SERVER: "SERVER",
} as const;

export type FailureKind = (typeof FailureKind)[keyof typeof FailureKind];

/** The status a transport failure is given: no answer ever arrived. */
export const OFFLINE_STATUS = 0;

export const failureKindOf = (error: unknown): FailureKind => {
  if (!(error instanceof ApiError)) {
    return FailureKind.SERVER;
  }

  if (error.status === OFFLINE_STATUS) {
    return FailureKind.OFFLINE;
  }
  if (error.status === 401 || error.status === 403) {
    return FailureKind.UNAUTHENTICATED;
  }
  if (error.status === 404) {
    return FailureKind.NOT_FOUND;
  }
  if (error.status === 409) {
    return FailureKind.CONFLICT;
  }
  if (error.status === 429) {
    return FailureKind.RATE_LIMITED;
  }
  if (error.status >= 400 && error.status < 500) {
    return FailureKind.INVALID;
  }

  return FailureKind.SERVER;
};

/** The codes a screen offers a specific affordance for. */
export const ApiErrorCode = {
  STORAGE_UNIT_NOT_EMPTY: "STORAGE_UNIT_NOT_EMPTY",
  CYCLIC_STORAGE_UNIT_MOVE: "CYCLIC_STORAGE_UNIT_MOVE",
  MISSING_EMPTY_TARGET: "MISSING_EMPTY_TARGET",
  TOO_MANY_ITEM_PHOTOS: "TOO_MANY_ITEM_PHOTOS",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  INVALID_SESSION: "INVALID_SESSION",
  TOO_MANY_LOGIN_ATTEMPTS: "TOO_MANY_LOGIN_ATTEMPTS",
  VALIDATION_FAILED: "VALIDATION_FAILED",
} as const;

export const isApiErrorWithCode = (error: unknown, code: string): boolean =>
  error instanceof ApiError && error.code === code;

/** `details.itemCount` and friends, read without trusting the wire. */
export const detailNumber = (error: unknown, key: string): number | null => {
  if (!(error instanceof ApiError)) {
    return null;
  }

  const value = error.details[key];

  return typeof value === "number" ? value : null;
};
