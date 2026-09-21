import { createMobileApiClient, type MobileApiClient } from "../api/mobile-client.js";
import type { SessionStore } from "../auth/session-store.js";

/**
 * Where the API lives, as a phone sees it.
 *
 * `127.0.0.1` is the emulator's own loopback and is almost never right on a
 * real device: a phone on the same wifi needs the machine's LAN address, and a
 * phone anywhere else needs the tunnel's public hostname. It is read from the
 * environment at build time rather than guessed, and the default is the one
 * that works with `pnpm --filter @ariadna/api dev` under an emulator.
 *
 * `EXPO_PUBLIC_` is not a secret prefix: everything under it is baked into the
 * bundle. That is correct here — the address of the API is not a credential,
 * and the credential is the token in the keystore.
 */
export const apiBaseUrl = (): string =>
  process.env["EXPO_PUBLIC_ARIADNA_API_URL"] ?? "http://127.0.0.1:3000";

/**
 * The one place the HTTP client and the session are tied together.
 *
 * The client reads the token per request, so a fresh sign-in takes effect
 * without rebuilding anything, and it clears the session the moment the API
 * refuses one — which is what turns a revoked token into a trip back to the
 * login screen instead of a screen full of failures.
 */
export const createDefaultClient = (
  sessions: SessionStore,
  baseUrl = apiBaseUrl(),
): MobileApiClient =>
  createMobileApiClient({
    baseUrl,
    token: () => sessions.token(),
    onUnauthorized: () => {
      sessions.clear();
    },
  });
