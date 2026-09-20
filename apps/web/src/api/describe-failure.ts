import { ApiError, FailureKind, failureKindOf } from "./api-error.js";

/**
 * One sentence a person can act on, for a failure a screen did not expect.
 *
 * Screens handle the refusals they have an answer for — a box that is not
 * empty offers to empty it — and everything else lands here. Even then the
 * kinds stay apart: "this is gone" and "the phone has no signal" are not the
 * same news, and telling somebody the wrong one sends them looking in the
 * wrong place.
 */
export const describeFailure = (error: unknown): string => {
  switch (failureKindOf(error)) {
    case FailureKind.OFFLINE:
      return "The app could not reach Ariadna. Check the connection and try again.";
    case FailureKind.NOT_FOUND:
      return "That is not here any more. It may have been deleted or moved.";
    case FailureKind.UNAUTHENTICATED:
      return "Your session has ended. Sign in again.";
    case FailureKind.RATE_LIMITED:
      return "Too many requests. Wait a moment and try again.";
    case FailureKind.CONFLICT:
    case FailureKind.INVALID:
      // These carry a message written about the exact situation, which beats
      // anything this function could invent.
      return error instanceof ApiError
        ? capitalise(error.message)
        : "Ariadna refused that request.";
    default:
      return "Ariadna had a problem answering. Try again in a moment.";
  }
};

const capitalise = (sentence: string): string =>
  sentence.length === 0 ? sentence : sentence[0]!.toUpperCase() + sentence.slice(1);
