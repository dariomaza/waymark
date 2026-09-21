import type { FastifyInstance } from "fastify";

/**
 * # Which first path segment belongs to the API
 *
 * Once the API serves the web client from its own origin, one origin has two
 * namespaces in it, and something has to decide which of them an unmatched
 * path belongs to. Get that wrong in the generous direction and a request for
 * an API path that no longer exists is answered with `200 text/html`: the
 * client reports `unexpected token < in JSON`, which is a sentence about a
 * parser and says nothing at all about the route that went missing.
 *
 * The set is DERIVED from Fastify's own route table rather than written down.
 * A list kept by hand is a second copy of the truth, and the copy that goes
 * stale here is the one that starts answering an API path with a page —
 * silently, because a page is a perfectly valid HTTP response. Registering a
 * route is the only way to be in the set, which is a property no future route
 * can forget to maintain.
 *
 * What derivation cannot notice is a whole family being REMOVED, so the test
 * in `web-client-routes.test.ts` pins the set against a literal. Deleting the
 * last `/search` route fails that test instead of quietly handing `/search`
 * to the web client.
 */

/**
 * The first segment of a route or request path, or `null` when there is none
 * to claim.
 *
 * `/` has no segment, and neither does a wildcard: `@fastify/cors` registers
 * an `OPTIONS *` route for preflights, and treating `*` as a namespace would
 * hand the API every path there is.
 */
export const rootSegmentOf = (path: string): string | null => {
  const segment = path.replace(/^\/+/u, "").split("/")[0] ?? "";
  if (segment === "" || segment === "*" || segment.startsWith(":")) {
    return null;
  }

  return segment;
};

/**
 * A request URL without its query string.
 *
 * `request.url` is the raw target, so it carries `?within=…` and `#…` along
 * with the path. Neither has any part in deciding which namespace a request
 * belongs to, and a query left on the end would make `/units/3?x=1` a
 * different path from `/units/3`.
 */
export const pathnameOf = (url: string): string =>
  url.split("#")[0]?.split("?")[0] ?? "/";

/**
 * Starts collecting, and answers the live set.
 *
 * Must be called before any route is registered: `onRoute` fires as routes are
 * added, not retroactively. The set is handed out rather than copied so the
 * not-found handler reads whatever the app finished with.
 */
export const collectApiNamespace = (app: FastifyInstance): ReadonlySet<string> => {
  const segments = new Set<string>();

  app.addHook("onRoute", (route) => {
    const segment = rootSegmentOf(route.url);
    if (segment !== null) {
      segments.add(segment);
    }
  });

  return segments;
};
