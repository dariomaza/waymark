import { createWebApiClient, type WebApiClient } from "../api/web-client.js";
import { sessionStore } from "../auth/session-store.js";

/**
 * Where the API lives, as a browser sees it. See `.env.example`.
 *
 * The default is the empty string, which makes every request relative and
 * therefore same-origin: the API serves this bundle, so the host it should
 * be called on is the host it was downloaded from. That is the whole point
 * of the default being empty rather than a URL — a deployed bundle needs no
 * build-time hostname, so the image that ships to a homelab is the same
 * image whatever the tunnel is called, and moving the tunnel is not a
 * rebuild.
 *
 * Setting `VITE_ARIADNA_API_URL` still works and is what `vite dev` uses
 * against an API on its own port. That is a genuine cross-origin browser
 * client, and it is the reason `ARIADNA_ALLOWED_ORIGINS` still exists.
 */
export const apiBaseUrl = (): string =>
  import.meta.env.VITE_ARIADNA_API_URL ?? "";

/**
 * The one place the HTTP client and the session are tied together.
 *
 * The client reads the token per request, so a fresh sign-in takes effect
 * without rebuilding anything, and it clears the session the moment the API
 * refuses one — which is what turns a revoked token into a trip back to the
 * login screen instead of a screen full of failures.
 */
export const createDefaultClient = (): WebApiClient =>
  createWebApiClient({
    baseUrl: apiBaseUrl(),
    token: () => sessionStore.read()?.token ?? null,
    onUnauthorized: () => {
      sessionStore.clear();
    },
  });
