import { ApiError, ApiErrorCode, detailNumber } from "@ariadna/api-client";

const count = (n: number, singular: string): string =>
  `${String(n)} ${n === 1 ? singular : `${singular}s`}`;

/**
 * "This box still has things in it" — in the numbers the API sent.
 *
 * `null` when the refusal was about something else, so a caller can tell the
 * one refusal it has an answer for from every other.
 */
export const notEmptyMessage = (error: unknown, name: string): string | null => {
  if (!(error instanceof ApiError) || error.code !== ApiErrorCode.STORAGE_UNIT_NOT_EMPTY) {
    return null;
  }

  const items = detailNumber(error, "itemCount") ?? 0;
  const units = detailNumber(error, "childUnitCount") ?? 0;
  const parts = [
    items > 0 ? count(items, "item") : "",
    units > 0 ? count(units, "unit") : "",
  ].filter((part) => part !== "");

  return `${name} still holds ${parts.join(" and ")}. Nothing is deleted with a box still full.`;
};

/**
 * A move the tree cannot take.
 *
 * The rule is the domain's (ADR 2) and the refusal is the API's; this only
 * turns it into something readable while standing in a garage.
 */
export const cyclicMoveMessage = (error: unknown, name: string): string | null =>
  error instanceof ApiError && error.code === ApiErrorCode.CYCLIC_STORAGE_UNIT_MOVE
    ? `${name} cannot go inside itself, or inside anything already inside it. Pick somewhere outside it.`
    : null;

/** The API asked for a target because the unit is a root. */
export const missingTargetMessage = (error: unknown): string | null =>
  error instanceof ApiError && error.code === ApiErrorCode.MISSING_EMPTY_TARGET
    ? "This unit has no parent to empty into. Choose where its contents should go."
    : null;

export interface FieldComplaint {
  readonly field: string;
  readonly message: string;
}

/**
 * The API's own validation issues, field by field.
 *
 * A 400 from the request schema is the far end of ADR 8's other half: fix the
 * REQUEST. It belongs next to the field that caused it, in the API's words,
 * because inventing a second copy of "names are at most 200 characters" here
 * is how the two come to disagree.
 */
export const fieldComplaints = (error: unknown): readonly FieldComplaint[] => {
  if (!(error instanceof ApiError) || error.code !== ApiErrorCode.VALIDATION_FAILED) {
    return [];
  }

  const issues = error.details["issues"];
  if (!Array.isArray(issues)) {
    return [];
  }

  return issues.flatMap((issue: unknown) => {
    if (typeof issue !== "object" || issue === null) {
      return [];
    }

    const { path, message } = issue as { path?: unknown; message?: unknown };

    return typeof message === "string"
      ? [{ field: typeof path === "string" ? path : "", message }]
      : [];
  });
};
