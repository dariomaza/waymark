/**
 * # Every address this app answers to, in one place
 *
 * The route table used to be eleven string literals inside the JSX and a
 * dozen more scattered across the links that point at them. As data, the
 * router is built from them, the links build their targets from them, and
 * `routes.test.ts` can check the whole set against the paths the API owns.
 *
 * That check is the reason this file exists. The API serves this client from
 * its own origin now, so the two share one namespace, and four of these used
 * to be paths the API already answered — `/search`, `/items`, `/items/:id`
 * and `/photos/processing`. A screen at one of those is not a broken link: a
 * browser opening it is handed JSON, and only on a COLD load, because once
 * the service worker is installed `navigateFallback` draws the shell from
 * the cache and everything looks fine. The only person who ever meets it is
 * somebody following a link for the first time.
 *
 * The rule that resolved it is one this client had already been following
 * without saying so: **where the API uses the resource name, this app uses
 * the shorter human word.** `/units/:id` for `GET /storage-units/:id` was
 * already that. `/things/:id` for `GET /items/:id` is the same rule applied
 * where it now has to hold, and `/find` and `/processing` follow it too. The
 * labels on screen are unchanged — this is about addresses, not words.
 *
 * Two of these are contracts and cannot move for any reason: `/` is the
 * manifest's `start_url`, and `/u/:publicId` is glued to boxes (ADR 12).
 */

export const ROUTES = {
  inventory: "/",
  login: "/login",
  /** `GET /search` is the API's; this is the screen that asks it. */
  find: "/find",
  scan: "/scan",
  unit: "/units/:id",
  unitLabel: "/units/:id/label",
  /**
   * Not under `/units/:id`, because a sheet is about a SET of units rather
   * than about one. `?within=` narrows it; nothing at all is the whole house.
   *
   * Nothing in the app builds the narrowed form any more. A box's menu used to,
   * and it was the wrong place for it — printing a sheet is a job you do for
   * the whole house. The screen still reads the parameter, because an address
   * somebody bookmarked or was sent should keep landing where they expected.
   */
  labels: "/labels",
  /** `GET /items` is the API's; this is the screen that draws its answer. */
  everything: "/things",
  thing: "/things/:id",
  /**
   * `GET /photos/processing` is the API's, and this screen is what reads it.
   *
   * Not in the bottom navigation on purpose: background removal is optional
   * and secondary (ADR 4), and it is reached from the note under a photo
   * whose removal failed.
   */
  backgroundRemoval: "/processing",
  /**
   * Everything that belongs to the person rather than to the inventory.
   *
   * It used to be a sheet behind an avatar in the top bar, and the argument
   * against giving it an address was that an origin with one namespace (ADR 16)
   * should not spend one on two controls. It is spent, because the phone has
   * always made this a destination and one account reached two ways is what made
   * the two clients read as two products. `/you` and not `/account`: where the
   * API uses the resource name, this app uses the shorter human word, and the
   * tab under the avatar says "You" in both languages.
   */
  account: "/you",
  /** The address printed on every box (ADR 12). */
  scannedLabel: "/u/:publicId",
} as const;

export const unitPath = (id: string): string => `/units/${id}`;

export const unitLabelPath = (id: string): string => `/units/${id}/label`;

export const thingPath = (id: string): string => `/things/${id}`;

export const scannedLabelPath = (publicId: string): string => `/u/${publicId}`;

/** A search already scoped to a subtree, which is what ADR 11 means by `within`. */
export const findWithinPath = (unitId: string): string =>
  `${ROUTES.find}?within=${unitId}`;
