/**
 * # Every address this app answers to, in one place
 *
 * The route table used to be eleven string literals inside the JSX and a
 * dozen more scattered across the links that point at them. As data, the
 * router is built from them, the links build their targets from them, and a
 * test can say something about the set as a whole — which is the point, now
 * that this client and the API share one origin.
 */

export const ROUTES = {
  inventory: "/",
  login: "/login",
  search: "/search",
  scan: "/scan",
  unit: "/units/:id",
  unitLabel: "/units/:id/label",
  /**
   * Not under `/units/:id`, because a sheet is about a SET of units rather
   * than about one. `?within=` narrows it; nothing at all is the whole house.
   */
  labels: "/labels",
  everything: "/items",
  thing: "/items/:id",
  /**
   * Not in the bottom navigation on purpose: background removal is optional
   * and secondary (ADR 4), and it is reached from the note under a photo
   * whose removal failed.
   */
  backgroundRemoval: "/photos/processing",
  /** The address printed on every box (ADR 12). */
  scannedLabel: "/u/:publicId",
} as const;

export const unitPath = (id: string): string => `/units/${id}`;

export const unitLabelPath = (id: string): string => `/units/${id}/label`;

export const thingPath = (id: string): string => `/items/${id}`;

export const scannedLabelPath = (publicId: string): string => `/u/${publicId}`;

/** A search already scoped to a subtree, which is what ADR 11 means by `within`. */
export const searchWithinPath = (unitId: string): string =>
  `${ROUTES.search}?within=${unitId}`;

export const labelsWithinPath = (unitId: string): string =>
  `${ROUTES.labels}?within=${unitId}`;
