import type { SessionView } from "@ariadna/api-client";

import type { SecureStorage } from "./secure-storage.js";

/**
 * The session as this client holds it: the opaque token the API issued, when
 * it stops being valid, and who it belongs to (ADR 6). The same three fields
 * the API answers a login with.
 */
export type Session = SessionView;

/**
 * Whether there IS a session is not knowable synchronously on a phone.
 *
 * The keystore is asynchronous, so between the app starting and the first read
 * coming back the honest answer is neither "signed in" nor "signed out". The
 * web client has no such state — `localStorage` answers immediately — and
 * collapsing this one into `null` would flash the login screen at somebody who
 * is signed in, every single cold start.
 */
export type SessionState =
  | { readonly status: "unknown" }
  | { readonly status: "known"; readonly session: Session | null };

export interface SessionStore {
  /** The snapshot React renders from. Synchronous on purpose. */
  read(): SessionState;
  /** The token for the next request, or `null`. Never a stale one. */
  token(): string | null;
  save(session: Session): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

const STORAGE_KEY = "ariadna.session";

export const createSessionStore = (storage: SecureStorage): SessionStore => {
  const listeners = new Set<() => void>();
  /**
   * The snapshot React renders from, by identity.
   *
   * It is a held object rather than one built per call on purpose:
   * `useSyncExternalStore` compares snapshots with `Object.is`, and a getter
   * that answered a fresh object every time would re-render for ever. So the
   * expiry is decided WHEN the session settles rather than on every read.
   */
  let state: SessionState = { status: "unknown" };

  const announce = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const isLive = (session: Session): boolean =>
    Date.parse(session.expiresAt) > Date.now();

  const settle = (session: Session | null): void => {
    // An expiry that has already passed is not a session. A phone left in a
    // pocket for a month opens on the login screen rather than on an inventory
    // it can no longer load.
    state = {
      status: "known",
      session: session !== null && isLive(session) ? session : null,
    };
    announce();
  };

  /**
   * One read of the keystore, at startup. A failure is not a crash: a phone
   * that will not give the token back is a phone that has to sign in again,
   * which is a screen rather than a stack trace.
   */
  void storage
    .read(STORAGE_KEY)
    .then((raw) => {
      settle(parseSession(raw));
    })
    .catch(() => {
      settle(null);
    });

  return {
    read() {
      return state;
    },

    /**
     * Checked again here, because a token is read once per request and the
     * session may have gone stale since it settled. A stale token would be
     * refused by the API anyway; not sending it saves the round trip and the
     * 401 that ends the session.
     */
    token() {
      if (state.status !== "known" || state.session === null) {
        return null;
      }

      return isLive(state.session) ? state.session.token : null;
    },

    save(session) {
      settle(session);
      // The write is not awaited: the app is already signed in, and a keystore
      // that is slow must not hold up the screen behind it.
      void storage.write(STORAGE_KEY, JSON.stringify(session)).catch(() => {
        // Memory already holds it; the session lasts as long as the app does.
      });
    },

    clear() {
      settle(null);
      void storage.remove(STORAGE_KEY).catch(() => {
        // Nothing to do: the token is gone from this process either way.
      });
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const parseSession = (raw: string | null): Session | null => {
  if (raw === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Session).token === "string" &&
      typeof (parsed as Session).expiresAt === "string"
    ) {
      return parsed as Session;
    }
  } catch {
    // A corrupted entry is no session at all.
  }

  return null;
};
