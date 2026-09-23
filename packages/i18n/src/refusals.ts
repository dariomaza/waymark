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

/**
 * # What a refused passkey means, as a sentence somebody can act on
 *
 * Each of these is a different NEXT STEP, which is the entire reason they are
 * not one apology: press the button again, use your password, remove that
 * device, name it something shorter. A screen that showed one sentence for all
 * of them would be telling somebody standing in a garage to guess.
 *
 * `null` for anything else, so a screen can tell the refusals it handles from
 * every other — the same bargain every function in this file makes.
 *
 * What is NOT here is a cancelled prompt. Nothing was refused: somebody
 * dismissed a dialog, which never reaches the API and is the client's own
 * `passkeys.cancelled`.
 */
export const passkeyFailureMessage = (error: unknown): Message | null => {
  if (!(error instanceof ApiError)) {
    return null;
  }

  switch (error.code) {
    case ApiErrorCode.PASSKEY_CEREMONY_EXPIRED:
      return message("passkeys.ceremonyExpired");
    case ApiErrorCode.INVALID_PASSKEY:
      return message("passkeys.notRecognised");
    case ApiErrorCode.CLONED_PASSKEY:
      /**
       * The one refusal here that names something. `details.label` is the
       * device, and "remove that one" is useless without knowing which.
       */
      return message("passkeys.cloned", {
        name: detailText(error, "label") ?? "",
      });
    case ApiErrorCode.PASSKEY_DID_NOT_VERIFY_THE_USER:
      return message("passkeys.needsVerification");
    case ApiErrorCode.PASSKEY_ALREADY_REGISTERED:
      return message("passkeys.alreadyRegistered");
    case ApiErrorCode.PASSKEY_NEEDS_A_PASSWORD:
      return message("passkeys.needsAPassword");
    case ApiErrorCode.INVALID_PASSKEY_LABEL:
      return message("passkeys.badName");
    case ApiErrorCode.PASSKEY_NOT_FOUND:
      return message("passkeys.alreadyGone");
    case ApiErrorCode.TOO_MANY_PASSKEY_ATTEMPTS:
      return message("passkeys.tooMany");
    default:
      return null;
  }
};

/**
 * A ceremony the device itself could not finish, as the two strings that
 * diagnose it.
 *
 * It is an interface rather than a class because the class belongs to a
 * client: the browser's `PasskeyCeremonyFailed` satisfies this by having the
 * two fields, and nothing here has to know about `DOMException`, which does
 * not exist on a phone client or under a test runner in Node.
 */
export interface PasskeyCeremonyFailure {
  /** The `DOMException` name the browser raised — `NotSupportedError`. */
  readonly reason: string;
  /**
   * `@simplewebauthn`'s own code when it recognised the failure, and `null`
   * when the browser raised something it had no name for.
   */
  readonly code: string | null;
}

/**
 * # What a ceremony the DEVICE refused becomes
 *
 * The other half of `passkeyFailureMessage`, and the one that was missing.
 * That function answers `null` for anything that is not an `ApiError`, which
 * is every browser failure there is, and the screens then fell through to
 * `describeFailure` and told somebody Waymark had a problem answering. The API
 * had answered 200 and was never asked again: the browser threw before the
 * finishing request was built.
 *
 * So this never returns `null`. A ceremony that failed on the device is
 * something this function always has an answer for, and the answer always
 * carries `reason` — the browser's own name for what happened, untranslated,
 * the same bargain `failure.asTheApiPutIt` makes with the API's prose. Three
 * names earn a better sentence than the general one; everything else gets the
 * general one WITH its reason, which is still a true sentence and still names
 * the thing a person can report.
 */
export const passkeyCeremonyFailureMessage = (
  failure: PasskeyCeremonyFailure,
): Message => {
  const reason =
    failure.code === null ? failure.reason : `${failure.reason} (${failure.code})`;

  switch (failure.reason) {
    case "InvalidStateError":
      // The authenticator was asked to make a credential it already holds for
      // this account. Nothing is wrong with the device and nothing is wrong
      // with Waymark; there is simply nothing to add.
      return message("passkeys.deviceHasOneAlready", { reason });
    case "NotSupportedError":
      // No algorithm in `pubKeyCredParams` is one this authenticator can sign
      // with, or nothing on the device can make the requested kind of
      // credential at all.
      return message("passkeys.deviceCannotMakeOne", { reason });
    case "SecurityError":
      // The page's own origin does not match the RP ID the server issued the
      // options for — the one failure here that is a deployment's fault
      // rather than a device's, and the one worth saying out loud, because
      // ADR 19 derives both from `WAYMARK_PUBLIC_BASE_URL`.
      return message("passkeys.deviceRefusedTheAddress", { reason });
    default:
      return message("passkeys.deviceFailed", { reason });
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
 *
 * ## Why a throwable that is not an `ApiError` is answered before the kinds
 *
 * `failureKindOf` answers `SERVER` for anything that is not an `ApiError`,
 * which is right for what it is — a reading of an HTTP failure, with one
 * sensible value for "no HTTP here" — and wrong as a thing to SAY. It is how
 * the passkey bug reached a person: a browser raised a `DOMException`, no
 * request was ever sent, and the screen said Waymark had a problem answering.
 * A TypeError in this app's own code lands in exactly the same place, and
 * "try again in a moment" is not what somebody should do about a bug.
 *
 * So the one case is separated here rather than in `failureKindOf`, which is
 * shared with `toneFor` and with every `switch` on a kind: the API's own
 * failures keep every sentence they had, including `failure.server` for a 5xx
 * and for a status this client has no rule for. Only the case that never
 * reached the API changes, and it changes from a false sentence to a true one.
 */
export const describeFailure = (error: unknown): Message => {
  if (!(error instanceof ApiError)) {
    return message("failure.unexpected");
  }

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
       *
       * There is no second branch for "not an `ApiError`" any more: one of
       * those can no longer reach a kind at all, so the sentence that stood
       * here for it (`Waymark refused that request`) was another apology the
       * server had not made.
       */
      return message("failure.asTheApiPutIt", { reason: capitalise(error.message) });
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
