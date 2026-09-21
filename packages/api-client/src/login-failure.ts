import { ApiError, ApiErrorCode, FailureKind, failureKindOf } from "./api-error.js";

/**
 * What to tell somebody whose sign-in did not work.
 *
 * A pure function of the error, so the sentences are testable without a
 * browser and the form stays a form.
 *
 * "Wrong password" and "cannot reach the server" must never be the same
 * sentence. The first makes you try again more carefully; the second makes you
 * walk towards the router. Telling a person the wrong one wastes their evening.
 */
export const loginFailureMessage = (error: unknown): string | null => {
  if (error === null || error === undefined) {
    return null;
  }

  if (error instanceof ApiError && error.code === ApiErrorCode.TOO_MANY_LOGIN_ATTEMPTS) {
    return "Too many attempts from this connection. Wait a few minutes and try again.";
  }

  switch (failureKindOf(error)) {
    case FailureKind.OFFLINE:
      return "The app could not reach Ariadna. Check the connection and try again.";
    case FailureKind.UNAUTHENTICATED:
      return "That username or password is wrong.";
    case FailureKind.RATE_LIMITED:
      return "Too many attempts from this connection. Wait a few minutes and try again.";
    case FailureKind.INVALID:
      return "Fill in both a username and a password.";
    default:
      return "Ariadna could not sign you in. Try again in a moment.";
  }
};
