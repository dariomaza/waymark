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
       * Whether this phone is HOLDING a sealed session right now.
       *
       * It is part of the SNAPSHOT rather than a question the login screen
       * asks, because the answer comes from the same one startup read as the
       * session itself. A screen that asked separately would be a second trip
       * to the keystore for a fact the first trip already had.
       *
       * It is also the whole of what the account screen's switch draws. There
       * is deliberately no "biometrics enabled" preference stored anywhere:
       * a preference beside the keystore is a second answer to one question,
       * and the two disagree the first time a seal is refused.
       *
       * It is a REPORT of what the keystore did, never a prediction of what
       * it is about to do — see `sealInto`.
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
   * Whether this device can stand behind a sealed value at all.
   *
   * Synchronous, like the keystore's own answer, because it is a property of
   * the hardware rather than a question being asked of anybody. It is what
   * decides whether the account screen draws a switch — a control that fails
   * the moment it is touched is worse than no control.
   */
  canSeal(): boolean;
  /**
   * Puts the session this store is holding behind the phone's sensor, raising
   * the system's prompt.
   *
   * Resolves either way. A dismissed prompt is an ANSWER and not a failure —
   * the same answer the login screen already respects — and what it leaves
   * behind is a phone that is simply not sealing anything, which `read()`
   * then says. Nothing is thrown for a screen to turn into an alarm about a
   * person choosing "not now".
   */
  sealSession(prompt: string): Promise<void>;
  /**
   * Takes the sealed session away: the token and the note beside it.
   *
   * Asks for no fingerprint. Deleting a sealed entry removes the stored bytes
   * rather than decrypting them, which matters most on the day somebody's
   * sensor is the reason they want this gone.
   *
   * The session in memory is deliberately untouched — turning a setting off
   * must not throw somebody out of the app they are standing in. What goes is
   * this phone's ability to open the NEXT one without a password.
   */
  unsealSession(): Promise<void>;
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
   * Re-settles a session ONLY if it is still the one being held.
   *
   * The sealing writes are asynchronous and a sign-out is not, so somebody can
   * leave while the keystore is still thinking. Without this guard the late
   * answer would settle a session that had already been cleared — signing
   * somebody back in from a promise they never saw.
   */
  const claim = (session: Session, sealed: boolean): void => {
    if (state.status !== "known" || state.session?.token !== session.token) {
      return;
    }

    settle(session, sealed);
  };

  /** Back to the shape of a phone that is not sealing anything. */
  const rollBack = async (): Promise<void> => {
    await Promise.all([
      storage.unseal(SESSION_KEY).catch(() => undefined),
      storage.remove(SEALED_UNTIL_KEY).catch(() => undefined),
    ]);
  };

  /**
   * # The seal is three writes, and the state reports what all three did
   *
   * The token goes behind a Keystore key the OS will not decrypt without a
   * fingerprint, a readable note beside it says a sealed session is there and
   * until when, and the copy in the clear goes — because anything that can
   * read THAT never has to ask about the seal, which would make the seal
   * decoration.
   *
   * Two things used to go wrong here, neither of them visible until the
   * account screen started drawing this flag:
   *
   * 1. The state was settled SEALED before the seal resolved. A dismissed
   *    prompt then left memory claiming a door that was never built — and on
   *    Android a dismissed prompt is the ordinary answer, not the rare one.
   * 2. A seal that SUCCEEDED and a note that then failed to write had the note
   *    withdrawn and nothing else, leaving a sealed token nothing points at:
   *    never offered, never opened, never cleaned up.
   *
   * So the rule is one sentence, and it is the rule for both:
   *
   * **The flag is a report of what the keystore did, never a prediction. It
   * goes true once all three writes have resolved, and any failure among them
   * rolls the phone back to the unsealed shape — sealed entry deleted, note
   * removed — and leaves it false.**
   *
   * Rolling back rather than keeping whatever survived is the safe direction
   * of the two errors this can make. Claiming less than the keystore holds
   * costs a password; claiming more offers a door that cannot open, which is
   * the one thing the sign-in screen may never do.
   *
   * What a roll-back deliberately does NOT do is write the token in the clear
   * instead. A phone that can seal and did not is not a phone that should be
   * quietly given the weaker thing behind somebody's back; memory holds the
   * session for as long as the app is open, exactly as it did before.
   */
  const sealInto = async (session: Session, prompt: string): Promise<void> => {
    try {
      await storage.seal(SESSION_KEY, JSON.stringify(session), prompt);
      await storage.write(SEALED_UNTIL_KEY, session.expiresAt);
      await storage.remove(SESSION_KEY);
    } catch {
      await rollBack();
      claim(session, false);

      return;
    }

    claim(session, true);
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
     *
     * # Signing in still seals, now that there is a switch
     *
     * The switch could have replaced this and deliberately does not. What was
     * wrong with the implicit seal was never that it happened; it was that it
     * happened ONCE and could not be undone — dismiss the prompt and the phone
     * would not offer a fingerprint again until the next sign-out. The switch
     * is what fixes that, and with it in place this stays as the DEFAULT,
     * because the alternatives are both worse: a sign-in that stored nothing
     * would make somebody type a password every launch until they went looking
     * for a setting, and one that stored a readable token would quietly hand
     * the weaker thing to a phone that can hold the stronger one.
     *
     * So: the strongest shape the hardware offers, by default, and one tap to
     * change your mind in either direction. See ADR 19.
     */
    save(session, sealPrompt) {
      const sealing = storage.canUnlock();
      // Settled UNSEALED even when it is about to seal. Nothing has been
      // written yet, so there is nothing to report.
      settle(session, false);

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

      void sealInto(session, sealPrompt);
    },

    canSeal() {
      return storage.canUnlock();
    },

    async sealSession(prompt) {
      const session = state.status === "known" ? state.session : null;

      if (session === null) {
        return;
      }

      await sealInto(session, prompt);
    },

    async unsealSession() {
      await rollBack();

      const session = state.status === "known" ? state.session : null;

      if (session !== null) {
        // The session stays; only the phone's memory of it goes.
        claim(session, false);
      }
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
