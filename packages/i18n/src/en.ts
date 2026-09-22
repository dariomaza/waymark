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
  "units.itemCount": { one: "{count} item", other: "{count} items" },
  "units.unitCount": { one: "{count} unit", other: "{count} units" },
} as const;
