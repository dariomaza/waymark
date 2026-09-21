/**
 * # The half of this origin that is not this app
 *
 * The API serves this client from its own process and its own hostname, so
 * one origin now holds two namespaces. The API's is the set of first path
 * segments its routes claim, and it derives that set from its own route
 * table at boot (`apps/api/src/http/api-namespace.ts`); this is the same set
 * written down on the side that cannot see it, pinned there by
 * `web-client-routes.test.ts` so the two cannot drift apart in silence.
 *
 * It does two jobs here, and both of them fail quietly if it is wrong.
 *
 * **No screen may be addressed by one of these.** A page at `/items` is not
 * a broken link — the API answers it, with JSON, and only on a cold load,
 * because once the service worker is installed it serves the shell from the
 * cache and the page appears to work. A bug that only happens to somebody
 * opening a link for the first time is the worst shape a bug can have.
 * `routes.test.ts` refuses it.
 *
 * **The service worker must not answer them either.** `navigateFallback`
 * hands the shell to every navigation in scope, and the scope is now the
 * whole origin including the API. Without the denylist, typing an API URL
 * into the address bar of an installed PWA would draw the app instead of
 * showing the JSON — which is the same lie as the first, told by the client.
 */
export const API_ROOT_SEGMENTS: readonly string[] = [
  "auth",
  "health",
  "items",
  "photos",
  "search",
  "storage-units",
];

/**
 * The same set as the patterns Workbox takes.
 *
 * Anchored at the start and closed with `(/|$)` so that `/items` and
 * `/items/3` are the API's while `/itemsomething` is not: a segment is a
 * whole segment, which is the same rule the API applies on its side.
 */
export const navigateFallbackDenylist: readonly RegExp[] = API_ROOT_SEGMENTS.map(
  (segment) => new RegExp(`^/${segment}(/|$)`, "u"),
);
