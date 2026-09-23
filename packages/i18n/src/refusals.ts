import {
  ApiError,
  ApiErrorCode,
  detailNumber,
  FailureKind,
  failureKindOf,
} from "@waymark/api-client";

import { message, type Message } from "./dictionary.js";

/**
 * # What a refusal MEANS, as something that can still be said in two languages
 *
 * These lived in `@waymark/api-client` and returned finished English
 * sentences. They return a `Message` now — a key and some numbers — and the
 * words are looked up wherever there is a person.
 *
 * The move is the whole architectural point of this package. WHICH refusal
 * happened is a fact about the API: `STORAGE_UNIT_NOT_EMPTY` is a contract
 * between two machines and must never change language, because a client that
 * matched on a translated code would be broken by a translation. What to TELL
 * somebody when it happens is the opposite kind of fact, and it is the same
 * sentence on both clients — a box that will not delete has to say so
 * identically whether somebody is holding a phone or standing at a laptop.
 *
 * Every one of these stays `null` for a failure it has no answer for, so a
 * screen can tell the one refusal it handles from every other.
 */

/**
 * "This box still has things in it" — in the numbers the API sent.
 *
 * The sentence carries two counts that each agree with their own noun, which
 * is why the contents are composed as a message inside a message rather than
 * written out as one phrase. English joins them with `and` and Spanish with
 * `y`, and `1 unidad` / `2 unidades` is not a suffix.
 */
export const notEmptyMessage = (error: unknown, name: string): Message | null => {
  if (!(error instanceof ApiError) || error.code !== ApiErrorCode.STORAGE_UNIT_NOT_EMPTY) {
    return null;
  }

  const items = detailNumber(error, "itemCount") ?? 0;
  const units = detailNumber(error, "childUnitCount") ?? 0;

  const itemsPart = message("units.itemCount", { count: items });
  const unitsPart = message("units.unitCount", { count: units });

  const contents =
    items > 0 && units > 0
      ? message("units.contentsBoth", { items: itemsPart, units: unitsPart })
      : units > 0
        ? unitsPart
        : itemsPart;

  return message("units.notEmpty", { name, contents });
};

/**
 * A move the tree cannot take.
 *
 * The rule is the domain's (ADR 2) and the refusal is the API's; this only
 * decides which sentence it becomes for somebody standing in a garage.
 */
export const cyclicMoveMessage = (error: unknown, name: string): Message | null =>
  error instanceof ApiError && error.code === ApiErrorCode.CYCLIC_STORAGE_UNIT_MOVE
    ? message("units.cyclicMove", { name })
    : null;

/** The API asked for a target because the unit is a root. */
export const missingTargetMessage = (error: unknown): Message | null =>
  error instanceof ApiError && error.code === ApiErrorCode.MISSING_EMPTY_TARGET
    ? message("units.missingTarget")
    : null;

/**
 * A move is all or nothing (ADR 3): one unknown id rejects the whole batch,
 * rather than leaving an inventory half moved. When that happens the person
 * has to be told that nothing changed — otherwise the safe behaviour reads
 * as a partial one.
 */
export const moveRefusedMessage = (error: unknown): Message | null => {
  if (!(error instanceof ApiError) || failureKindOf(error) !== FailureKind.INVALID) {
    return null;
  }

  return message("items.moveRefused", { reason: describeFailure(error) });
};

export const tooManyPhotosMessage = (error: unknown, limit: number): Message | null =>
  error instanceof ApiError && error.code === ApiErrorCode.TOO_MANY_ITEM_PHOTOS
    ? message("photos.tooMany", { limit })
    : null;

/**
 * What to tell somebody whose sign-in did not work.
 *
 * "Wrong password" and "cannot reach the server" must never be the same
 * sentence. The first makes you try again more carefully; the second makes you
 * walk towards the router. Telling a person the wrong one wastes their evening.
 */
export const loginFailureMessage = (error: unknown): Message | null => {
  if (error === null || error === undefined) {
    return null;
  }

  if (error instanceof ApiError && error.code === ApiErrorCode.TOO_MANY_LOGIN_ATTEMPTS) {
    return message("login.tooManyAttempts");
  }

  switch (failureKindOf(error)) {
    case FailureKind.OFFLINE:
      return message("failure.offline");
    case FailureKind.UNAUTHENTICATED:
      return message("login.wrongCredentials");
    case FailureKind.RATE_LIMITED:
      return message("login.tooManyAttempts");
    case FailureKind.INVALID:
      return message("login.missingCredentials");
    default:
      return message("login.unavailable");
  }
};

/**
 * # The three refusals the machine-token panel has a real answer for
 *
 * Everything else falls through to `describeFailure`, which passes the API's
 * own English sentence along. These three do not, because they are the ones an
 * operator meets constantly and the ones with something to DO about them:
 * pick another name, fix this one, or stop looking for a token that is
 * already gone.
 *
 * `null` for anything else, so a screen can tell the refusals it handles from
 * every other — the same bargain every function in this file makes.
 */
export const machineTokenFailureMessage = (error: unknown): Message | null => {
  if (!(error instanceof ApiError)) {
    return null;
  }

  switch (error.code) {
    case ApiErrorCode.MACHINE_TOKEN_NAME_ALREADY_TAKEN:
      return message("tokens.nameTaken", {
        name: detailText(error, "machineTokenName") ?? "",
      });
    case ApiErrorCode.INVALID_MACHINE_TOKEN_NAME:
      return message("tokens.badName");
    case ApiErrorCode.MACHINE_TOKEN_NOT_FOUND:
      return message("tokens.alreadyGone");
    default:
      return null;
  }
};

/** A string out of `details`, read without trusting the wire. */
const detailText = (error: ApiError, key: string): string | null => {
  const value = error.details[key];

  return typeof value === "string" ? value : null;
};

/**
 * One sentence a person can act on, for a failure a screen did not expect.
 *
 * Screens handle the refusals they have an answer for — a box that is not
 * empty offers to empty it — and everything else lands here. Even then the
 * kinds stay apart: "this is gone" and "the phone has no signal" are not the
 * same news, and telling somebody the wrong one sends them looking in the
 * wrong place.
 */
export const describeFailure = (error: unknown): Message => {
  switch (failureKindOf(error)) {
    case FailureKind.OFFLINE:
      return message("failure.offline");
    case FailureKind.NOT_FOUND:
      return message("failure.notFound");
    case FailureKind.UNAUTHENTICATED:
      return message("failure.sessionEnded");
    case FailureKind.RATE_LIMITED:
      return message("failure.rateLimited");
    case FailureKind.CONFLICT:
    case FailureKind.INVALID:
      /**
       * These carry a message written about the exact situation, which beats
       * anything this function could invent — and it arrives from the API in
       * English, because an API's prose is not translated any more than its
       * codes are (see the package README in `index.ts`).
       *
       * Passing it through is the honest choice. A Spanish sentence invented
       * here for a refusal nobody has met yet would be a guess at what the
       * server meant; the server's own words at least describe what happened.
       * The refusals that MATTER each have a translated sentence above.
       */
      return error instanceof ApiError
        ? message("failure.asTheApiPutIt", { reason: capitalise(error.message) })
        : message("failure.refused");
    default:
      return message("failure.server");
  }
};

export interface FieldComplaint {
  readonly field: string;
  readonly message: string;
}

/**
 * The API's own validation issues, field by field.
 *
 * Deliberately NOT translated, and deliberately still returning strings. A 400
 * from the request schema is the far end of ADR 8's other half: fix the
 * REQUEST. It belongs next to the field that caused it, in the API's words,
 * because inventing a second copy of "names are at most 200 characters" here
 * is how the two come to disagree — and translating it would make that second
 * copy inevitable.
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

    const { path, message: text } = issue as { path?: unknown; message?: unknown };

    return typeof text === "string"
      ? [{ field: typeof path === "string" ? path : "", message: text }]
      : [];
  });
};

const capitalise = (sentence: string): string =>
  sentence.length === 0 ? sentence : sentence[0]!.toUpperCase() + sentence.slice(1);
