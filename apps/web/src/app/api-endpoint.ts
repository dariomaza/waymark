import { apiBaseUrl } from "./create-client.js";

/**
 * # The address the calls actually go to, as this browser can see it
 *
 * A machine token on its own is half a credential. The other half is where to
 * present it, and that address is the one thing the panel could get wrong in a
 * way nobody would notice until a program somewhere else was failing.
 *
 * ## Why this is not simply printed out of the build
 *
 * `VITE_WAYMARK_API_URL` is a BUILD-time constant and it is **empty in every
 * deployment** (ADR 16, `create-client.ts`): the API serves this bundle, so
 * every request is relative and there is no hostname to bake in. Printing the
 * variable would therefore print nothing at all where it matters most — and on
 * a `vite dev` build it would print `http://127.0.0.1:3000`, which is a true
 * sentence about the laptop that ran the build and a lie on the phone reading
 * it. A value that says `localhost` to somebody standing in a garage is worse
 * than no value, because it looks like an answer.
 *
 * The truthful source is the DOCUMENT. This app was downloaded from the API,
 * so the origin the browser is at is by construction the origin its relative
 * requests go to — the same fact the empty default already relies on, read
 * where it is still true rather than where it was guessed. It also cannot go
 * stale: move the tunnel and the address moves with it, because it is not
 * stored anywhere.
 *
 * The configured base is still honoured and still resolved against the
 * document, which keeps the one caller that genuinely is cross-origin — `vite
 * dev` on `:5173` against an API on `:3000` — telling the truth as well.
 *
 * ## It is not a secret, and it is not treated like one
 *
 * Unlike the token beside it, this can be read again, printed, cached and
 * copied freely. It is derived on demand from `window.location`, so there is
 * nothing to invalidate and nothing to clear on sign-out.
 */
export const resolveApiEndpoint = (base: string, documentUrl: string): string => {
  const trimmed = base.trim();

  let resolved: URL;
  try {
    // `"/"` rather than `""`: an empty base resolves to the document URL
    // itself, path and query and all, and what is wanted is the origin the
    // requests go to — not the screen somebody happened to be looking at.
    resolved = new URL(trimmed === "" ? "/" : trimmed, documentUrl);
  } catch {
    // A base nothing can parse is a broken build, and the honest answer is
    // still the origin this bundle came from rather than the broken string.
    return new URL(documentUrl).origin;
  }

  resolved.search = "";
  resolved.hash = "";

  // The shared client builds every URL as `${base}${path}` and every path
  // begins with a slash, so a trailing one would make `https://host//items` —
  // wrong to read, and wrong in the environment file somebody pastes it into.
  return resolved.toString().replace(/\/+$/u, "");
};

export const apiEndpoint = (): string =>
  resolveApiEndpoint(apiBaseUrl(), window.location.href);
