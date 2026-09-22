/**
 * # Every word a person reads, in English
 *
 * This file is the SOURCE of the contract, not merely one of two translations.
 * `Dictionary` is derived from it (see `dictionary.ts`), so the keys here are
 * the keys that exist, the holes in these sentences are the values a screen
 * must hand over, and a phrase written with plural forms here is one Spanish
 * must also count.
 *
 * ## `as const` is load-bearing
 *
 * Without it these are just `string` and the braces are just characters. With
 * it, TypeScript can read `{username}` out of the type and refuse a screen
 * that forgets to pass one. Do not widen it.
 *
 * ## What is NOT here
 *
 * The API's error codes and the domain's vocabulary. `STORAGE_UNIT_NOT_EMPTY`
 * is a contract between two machines and means the same thing in Madrid as in
 * Manchester; what a person reads WHEN it happens is the sentence in this file
 * that the code is turned into. The same goes for the product's name: Ariadna
 * is called Ariadna in both languages.
 */
export const EN = {
  // ---------------------------------------------------------------------
  // The frame around every signed-in screen
  // ---------------------------------------------------------------------
  "language.label": "Language",
  "shell.signedInAs": "Signed in as {username}",
  "shell.signOut": "Sign out",

  /** What the app is doing while the keystore is being read on a cold start. */
  "shell.opening": "Opening Ariadna",
  "shell.checkingSession": "Checking your session",
  "session.unconfirmed": "Ariadna could not confirm your session",
  "session.signInAgain": "Sign in again",

  /** The name of the landmark itself, announced before the links inside it. */
  "nav.label": "Main",

  /**
   * "Places" and "Things", not "Inventory" and "Items".
   *
   * The two words a person uses standing in a garage are where and what.
   * "Inventory" is the name of the database; the tab is for the person, so it
   * takes the person's word — and the Spanish does the same rather than
   * translating the database's word into `Inventario`.
   */
  "nav.places": "Places",
  "nav.things": "Things",
  "nav.search": "Search",
  "nav.scan": "Scan",

  // ---------------------------------------------------------------------
  // Counting what is inside a storage unit
  // ---------------------------------------------------------------------
  "units.treeLabel": "Storage units",
  "units.itemCount": { one: "{count} item", other: "{count} items" },
  "units.unitCount": { one: "{count} unit", other: "{count} units" },

  // ---------------------------------------------------------------------
  // Refusals a person reads, shared by both clients
  // ---------------------------------------------------------------------

  /** Composed from two counts, each agreeing with its own noun. See `refusals.ts`. */
  "units.contentsBoth": "{items} and {units}",
  "units.notEmpty":
    "{name} still holds {contents}. Nothing is deleted with a box still full.",
  "units.cyclicMove":
    "{name} cannot go inside itself, or inside anything already inside it. Pick somewhere outside it.",
  "units.missingTarget":
    "This unit has no parent to empty into. Choose where its contents should go.",

  "items.moveRefused":
    "Nothing was moved. {reason} A move is all or nothing, so the rest stayed where they were.",

  "photos.tooMany": "This item already holds {limit} photos. Delete one to make room.",
  "photos.removalPending":
    "Background removal is still pending. The original is shown, and it stays shown whether or not the background is ever removed.",
  "photos.removalFailed":
    "Background removal failed for this photo. The original is shown instead.",

  "login.wrongCredentials": "That username or password is wrong.",
  "login.tooManyAttempts":
    "Too many attempts from this connection. Wait a few minutes and try again.",
  "login.missingCredentials": "Fill in both a username and a password.",
  "login.unavailable": "Ariadna could not sign you in. Try again in a moment.",

  "failure.offline": "The app could not reach Ariadna. Check the connection and try again.",
  "failure.notFound": "That is not here any more. It may have been deleted or moved.",
  "failure.sessionEnded": "Your session has ended. Sign in again.",
  "failure.rateLimited": "Too many requests. Wait a moment and try again.",
  "failure.refused": "Ariadna refused that request.",
  "failure.server": "Ariadna had a problem answering. Try again in a moment.",
  /**
   * The API's own sentence about the exact situation, passed through. It
   * arrives in English and stays that way — see `describeFailure`.
   */
  "failure.asTheApiPutIt": "{reason}",

  // ---------------------------------------------------------------------
  // What a storage unit is, as a word rather than as a rule (ADR 1)
  // ---------------------------------------------------------------------
  "units.kind.room": "Room",
  "units.kind.furniture": "Furniture",
  "units.kind.shelf": "Shelf",
  "units.kind.drawer": "Drawer",
  "units.kind.box": "Box",
  "units.kind.bag": "Bag",
  "units.kind.other": "Other",

} as const;
