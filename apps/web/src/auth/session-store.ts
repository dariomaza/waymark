import type { UserView } from "@waymark/api-client";

/**
 * The session as this client holds it: the opaque token the API issued, when
 * it stops being valid, and who it belongs to (ADR 6).
 */
export interface Session {
  readonly token: string;
  /** ISO 8601, as the API sends it. */
  readonly expiresAt: string;
  readonly user: UserView;
}

export interface SessionStore {
  /** `null` when there is no session, or when the one stored has expired. */
  read(): Session | null;
  save(session: Session): void;
  clear(): void;
  /** Notifies on every change here AND in another tab. */
  subscribe(listener: () => void): () => void;
}

const STORAGE_KEY = "ariadna.session";

/**
 * # Where the token lives, and why it lives there
 *
 * `localStorage`, deliberately.
 *
 * A cookie with `httpOnly` would be genuinely stronger against XSS, and ADR 6
 * already weighed that: the API issues an opaque bearer token because the same
 * mechanism has to work unchanged for this app and for the Expo one, and one
 * mechanism that revokes instantly beats two that disagree. A bearer token has
 * to be readable by the code that sends it, so the browser's storage is the
 * only place left.
 *
 * What that buys back is the thing a phone in a garage needs: the session
 * survives the app being closed, the screen locking and the browser reaping
 * the tab, so scanning a box does not mean logging in again. The real control
 * is revocation, which is immediate and server side.
 *
 * Storage can throw — a browser in private mode, a phone with site data
 * blocked — and a session that cannot be persisted must still work for as long
 * as the app is open, so every access falls back to memory.
 */
const createSessionStore = (): SessionStore => {
  const listeners = new Set<() => void>();
  let memory: string | null = null;
  /** Parsed once per distinct stored string, so the snapshot is stable. */
  let cache: { readonly raw: string | null; readonly value: Session | null } = {
    raw: null,
    value: null,
  };

  const readRaw = (): string | null => {
    try {
      return globalThis.localStorage?.getItem(STORAGE_KEY) ?? memory;
    } catch {
      return memory;
    }
  };

  const writeRaw = (raw: string | null): void => {
    memory = raw;
    try {
      if (raw === null) {
        globalThis.localStorage?.removeItem(STORAGE_KEY);
      } else {
        globalThis.localStorage?.setItem(STORAGE_KEY, raw);
      }
    } catch {
      // Memory is the fallback and already holds it.
    }
  };

  const announce = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const store: SessionStore = {
    read() {
      const raw = readRaw();
      if (raw !== cache.raw) {
        cache = { raw, value: parseSession(raw) };
      }

      // An expiry that has passed is not a session. Checked on the way out
      // rather than on a timer, so an app left open for a month does not draw
      // an inventory it can no longer load.
      const session = cache.value;
      if (session !== null && Date.parse(session.expiresAt) <= Date.now()) {
        return null;
      }

      return session;
    },

    save(session) {
      writeRaw(JSON.stringify(session));
      announce();
    },

    clear() {
      writeRaw(null);
      announce();
    },

    subscribe(listener) {
      listeners.add(listener);
      // Signing out in one tab signs out in every tab: the token is one row on
      // the server, and two tabs disagreeing about whether it exists is how a
      // screen ends up showing an inventory it can no longer load.
      const onStorage = (event: StorageEvent): void => {
        if (event.key === null || event.key === STORAGE_KEY) {
          listener();
        }
      };
      globalThis.addEventListener?.("storage", onStorage);

      return () => {
        listeners.delete(listener);
        globalThis.removeEventListener?.("storage", onStorage);
      };
    },
  };

  return store;
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

/**
 * One browser, one session. A module level instance rather than a provider
 * because the token has to be readable from outside React — the API client
 * reads it on every request and clears it when the API refuses it.
 */
export const sessionStore = createSessionStore();
