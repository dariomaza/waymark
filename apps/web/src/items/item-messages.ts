import { ApiError, ApiErrorCode, FailureKind, failureKindOf } from "../api/api-error.js";
import { describeFailure } from "../api/describe-failure.js";

/**
 * A move is all or nothing (ADR 3): one unknown id rejects the whole batch,
 * rather than leaving an inventory half moved. When that happens the person
 * has to be told that nothing changed — otherwise the safe behaviour reads
 * as a partial one.
 */
export const moveRefusedMessage = (error: unknown): string | null => {
  if (!(error instanceof ApiError)) {
    return null;
  }

  if (failureKindOf(error) === FailureKind.INVALID) {
    return `Nothing was moved. ${describeFailure(error)} A move is all or nothing, so the rest stayed where they were.`;
  }

  return null;
};

export const tooManyPhotosMessage = (error: unknown, limit: number): string | null =>
  error instanceof ApiError && error.code === ApiErrorCode.TOO_MANY_ITEM_PHOTOS
    ? `This item already holds ${String(limit)} photos. Delete one to make room.`
    : null;
