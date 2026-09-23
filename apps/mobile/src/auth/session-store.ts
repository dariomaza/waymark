import type { SessionView } from "@waymark/api-client";

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
  | {
      readonly status: "known";
      readonly session: Session | null;
      /**
       * Whether a fingerprint could open a session this phone is already
       * holding.
       *
       * It is part of the SNAPSHOT rather than a question the login screen
       * asks, because the answer comes from the same one startup read as the
       * session itself. A screen that asked separately would be a second trip
       * to the keystore for a fact the first trip already had.
       */
      readonly sealed: boolean;
    };

export interface SessionStore {
  /** The snapshot React renders from. Synchronous on purpose. */
  read(): SessionState;
  /** The token for the next request, or `null`. Never a stale one. */
  token(): string | null;
  /**
   * The prompt is handed IN because it is copy, and copy belongs to the
   * language on screen rather than to a store built before the language was
   * read. On Android the sealing write raises the system prompt itself.
   */
  save(session: Session, sealPrompt: string): void;
  clear(): void;
  /**
   * Puts the system's prompt on screen and, if somebody proves who they are,
   * settles the session it was holding.
   *
   * Rejects when the prompt is dismissed. Resolves `null` when the keystore
   * has nothing to give — which is what a key invalidated by a changed
   * fingerprint looks like — and takes the note away with it, so a door that
   * can never open again stops being offered.
   */
  unlockSealed(prompt: string): Promise<Session | null>;
  subscribe(listener: () => void): () => void;
}

export const SESSION_KEY = "waymark.session";

/**
 * The note beside the sealed token: when the session it holds stops being one.
 *
 * Deliberately NOT secret and deliberately NOT sealed. Its whole job is to be
 * readable without proving anything, so the login screen can decide whether to
 * offer a fingerprint without spending one to find out. A screen that had to
 * read the token to learn there was a token would be a prompt in front of the
 * app on every cold start — the gate this feature is not.
 *
 * An expiry is not a credential. It says a session existed and until when,
 * which is what the lock screen of every phone already tells anybody holding
 * it.
 */
export const SEALED_UNTIL_KEY = "waymark.session.sealed";

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

  const settle = (session: Session | null, sealed = false): void => {
    // An expiry that has already passed is not a session. A phone left in a
    // pocket for a month opens on the login screen rather than on an inventory
    // it can no longer load.
    state = {
      status: "known",
      session: session !== null && isLive(session) ? session : null,
      sealed,
    };
    announce();
  };

  /**
   * # One read of the keystore, at startup, that asks nothing of anybody
   *
   * Two keys, neither of them sealed: the token as it is stored on a phone
   * that cannot seal one, and the note that says a sealed one is waiting. The
   * sealed token itself is deliberately not touched here — reading it is what
   * raises the prompt, and a prompt nobody asked for, in front of the whole
   * app, on every cold start, is the thing this design exists to avoid.
   *
   * A failure is not a crash: a phone that will not give the token back is a
   * phone that has to sign in again, which is a screen rather than a stack
   * trace.
   */
  void Promise.all([
    storage.read(SESSION_KEY).catch(() => null),
    storage.read(SEALED_UNTIL_KEY).catch(() => null),
  ])
    .then(([raw, sealedUntil]) => {
      settle(
        parseSession(raw),
        // A door is only worth drawing when it has something behind it, that
        // something is still a session, and this phone can actually open it.
        sealedUntil !== null && Date.parse(sealedUntil) > Date.now() && storage.canUnlock(),
      );
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

    /**
     * # Sealed where that means something, in the clear where it does not
     *
     * A phone with an enrolled biometric gets the strong version: the token
     * goes behind a Keystore key the OS will not decrypt without a
     * fingerprint, and the note beside it says a sealed session is there.
     *
     * A phone WITHOUT one gets exactly what it had before this feature
     * existed. Sealing there would write a value nothing on that device can
     * ever decrypt — which is not security, it is throwing the session away
     * and calling it strong — and making those people type a password on every
     * launch would be charging them for something the hardware cannot give.
     *
     * Neither write is awaited, for the reason it never was: the app is
     * already signed in, and a keystore that is slow must not hold up the
     * screen behind it. On Android the sealed write raises its own prompt, so
     * a cancelled one must cost the session it just created nothing — memory
     * holds it, and the phone simply will not offer the door next time.
     */
    save(session, sealPrompt) {
      const sealing = storage.canUnlock();
      settle(session, sealing);

      if (!sealing) {
        void storage
          .write(SESSION_KEY, JSON.stringify(session))
          // A sealed token on a phone with nothing left to open it can never
          // be decrypted again, and a note claiming a door is waiting would
          // offer one that cannot open.
          .then(async () => {
            await Promise.all([
              storage.unseal(SESSION_KEY),
              storage.remove(SEALED_UNTIL_KEY),
            ]);
          })
          .catch(() => {
            // Memory already holds it; the session lasts as long as the app does.
          });

        return;
      }

      void storage
        .seal(SESSION_KEY, JSON.stringify(session), sealPrompt)
        .then(async () => {
          await storage.write(SEALED_UNTIL_KEY, session.expiresAt);
          // And no readable copy beside the sealed one. A phone that had none
          // of this yesterday still holds the token it wrote then, and
          // anything that can read THAT never has to ask about the seal —
          // which would make the seal decoration.
          await storage.remove(SESSION_KEY);
        })
        .catch(() => {
          // Nothing was sealed, so nothing must claim one is waiting.
          void storage.remove(SEALED_UNTIL_KEY).catch(() => {
            // Already absent, or a keystore that will not answer. Either way
            // the note is not to be trusted and the door is not offered.
          });
        });
    },

    clear() {
      settle(null);
      // Both, and neither needs a fingerprint: deleting a sealed entry removes
      // the stored bytes rather than decrypting them, so signing out works
      // with a thumb that will not read.
      void Promise.all([
        storage.remove(SESSION_KEY),
        storage.unseal(SESSION_KEY),
        storage.remove(SEALED_UNTIL_KEY),
      ]).catch(() => {
        // Nothing to do: the token is gone from this process either way.
      });
    },

    async unlockSealed(prompt) {
      const session = parseSession(await storage.unlock(SESSION_KEY, prompt));

      if (session === null) {
        // The keystore has nothing behind that door, which on Android is also
        // what a key invalidated by a changed fingerprint looks like. The note
        // is now a lie, so it goes.
        settle(null);
        await storage.remove(SEALED_UNTIL_KEY).catch(() => {
          // The door is already withdrawn in this process.
        });

        return null;
      }

      // Settled, not saved: the keystore already holds this exact session, and
      // writing it back would raise a second prompt for nothing.
      settle(session, true);

      return state.status === "known" ? state.session : null;
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
