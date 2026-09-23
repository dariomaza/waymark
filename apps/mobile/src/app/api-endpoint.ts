import { apiBaseUrl } from "./create-client.js";

/**
 * # The address the calls actually go to, as a phone can see it
 *
 * A machine token on its own is half a credential. The other half is where to
 * present it, and that address is the one thing this screen could get wrong
 * in a way nobody would notice until a program somewhere else was failing.
 *
 * ## Why this is not the same source the web client uses
 *
 * `apps/web` reads `window.location`, because its bundle is SERVED by the API
 * and carries no hostname (ADR 16): the document is the only place the truth
 * survives. A phone has the opposite problem and therefore the opposite
 * answer. There is no document, nothing served this app, and its requests are
 * never relative — every one of them is built as `${base}${path}` from
 * `EXPO_PUBLIC_WAYMARK_API_URL`, which is baked into the bundle precisely
 * because a phone has to be told where the house is.
 *
 * So the truthful source here is that same base. It is not a second opinion
 * about the address: it is literally the string every request in this app
 * already goes to, which is what makes it impossible for this panel to print
 * an address the app itself is not using.
 *
 * ## It is not a secret, and it is not treated like one
 *
 * Unlike the token beside it, it can be read again, printed, cached and
 * copied freely. There is nothing to invalidate and nothing to clear on
 * sign-out.
 */
export const resolveApiEndpoint = (base: string): string => {
  // Deliberately string surgery rather than a `URL`. React Native's `URL` is
  // a partial implementation whose parts are read-only, so the web client's
  // "parse it, blank the search, print it" would not survive here — and more
  // to the point, a base that `URL` cannot parse is a broken build whose
  // requests are still being sent to that exact string. Reprinting a parsed
  // version would let this panel disagree with the client beside it; taking
  // the end off the string cannot.
  const withoutQuery = base.trim().split(/[?#]/u)[0] ?? "";

  // Every path in the shared client begins with a slash, so a trailing one
  // here would make `https://host//items` — wrong to read, and wrong in the
  // environment file somebody pastes it into.
  return withoutQuery.replace(/\/+$/u, "");
};

export const apiEndpoint = (): string => resolveApiEndpoint(apiBaseUrl());
