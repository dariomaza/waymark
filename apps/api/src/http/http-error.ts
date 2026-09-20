/**
 * A refusal that the HTTP layer itself decides, as opposed to one the domain
 * raises. Everything a client receives has this shape:
 *
 * ```json
 * { "error": { "code": "STORAGE_UNIT_NOT_EMPTY", "message": "...", "details": { } } }
 * ```
 *
 * `code` is the contract; clients branch on it. `message` is for a human
 * reading a log or a toast, and may change. `details` is whatever the caller
 * needs in order to do something about it.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
}

export const errorBody = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ErrorBody => ({
  error: details === undefined ? { code, message } : { code, message, details },
});
