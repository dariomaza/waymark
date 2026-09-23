/**
 * # Everything a person reads
 *
 * There is one API and two clients (README). `@waymark/api-client` is the
 * contract with the API — the JSON it answers with, the refusals it makes, and
 * how to tell them apart. This package is the other half of that sentence: the
 * contract with the PERSON.
 *
 * ## Why this is a package and not a folder in each app
 *
 * The line is not "shared code". The line is who the words are for.
 *
 * `STORAGE_UNIT_NOT_EMPTY` is a contract between two machines and must never
 * change language — a client that matched on a translated error code would be
 * broken by a translation. But the SENTENCE that refusal becomes is read by a
 * person, and it is the same sentence on both clients, because a box that will
 * not delete has to say so identically whether somebody is holding a phone or
 * standing at a laptop. Written twice, it drifts; written here, it cannot.
 *
 * So the dependency runs one way and only one way:
 *
 *     domain  ->  api-client  ->  i18n  ->  web, mobile
 *
 * The api client knows what the machine said. This knows what to tell the
 * person. Neither knows what is drawn around it, which is why there is no
 * React in here — each client holds the chosen language in its own context and
 * stores it in the one place that platform has.
 */
export {
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGE_NAMES,
  LANGUAGES,
  preferredLanguage,
  type Language,
} from "./language.js";

export { message, type Dictionary, type Message, type MessageKey } from "./dictionary.js";
export { translator, type Translate } from "./translate.js";

/**
 * What a refusal MEANS, as something that can still be said in two languages.
 *
 * These are pure functions of an `ApiError` and they are shared for the same
 * reason the error kinds are: a 409 on a delete has to offer to empty the box
 * on both clients, and a sentence written twice is a sentence that drifts.
 * What each app then draws around them — a sheet, a callout, a toast — is its
 * own.
 */
export {
  cyclicMoveMessage,
  describeFailure,
  fieldComplaints,
  loginFailureMessage,
  machineTokenFailureMessage,
  missingTargetMessage,
  moveRefusedMessage,
  notEmptyMessage,
  passkeyFailureMessage,
  tooManyPhotosMessage,
  type FieldComplaint,
} from "./refusals.js";

export { kindChoices, kindLabel } from "./kind-label.js";
export { photoStatusNote } from "./photo-status.js";
