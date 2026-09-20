import { createWebApiClient, type WebApiClient } from "../api/web-client.js";
import { sessionStore } from "../auth/session-store.js";

/** Where the API lives. See `.env.example`. */
export const apiBaseUrl = (): string =>
  import.meta.env.VITE_ARIADNA_API_URL ?? "http://127.0.0.1:3000";

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
