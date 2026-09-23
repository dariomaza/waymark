/** A live, revocable grant. Deleting the row is what revocation means. */
export interface Session {
  readonly id: string;
  /** SHA-256 of the token. The token itself is never stored. */
  readonly tokenHash: string;
  readonly userId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /**
   * Which door this session was opened through (ADR 19).
   *
   * There is still only ONE kind of session: the token, its lifetime, its
   * renewal and its revocation are identical whichever value this holds, and
   * nothing in the inventory can tell. It exists for a single rule, on a
   * single route — a passkey may be registered only from a password-backed
   * session — and it is the same argument ADR 18 makes about a machine token
   * that could mint a machine token: a credential able to issue its own
   * successor outlives every password change made to stop it.
   */
  readonly createdWith: SessionOpener;
}

/**
 * The two ways a session can come into existence, and there is no third:
 * a password (ADR 6) or a passkey (ADR 19). A machine token opens no session
 * at all — it IS the credential, presented on every request.
 */
export const SessionOpener = {
  Password: "password",
  Passkey: "passkey",
} as const;

export type SessionOpener = (typeof SessionOpener)[keyof typeof SessionOpener];

export const SESSION_OPENERS: readonly SessionOpener[] = [
  SessionOpener.Password,
  SessionOpener.Passkey,
];

/**
 * SQLite has no enum type, so the column is a string and the value is checked
 * on the way OUT of the database rather than trusted — exactly as
 * `MachineTokenScope` is, and for a sharper version of the same reason: the
 * permissive value here is `password`, so a row nobody recognises must stop
 * the request rather than fall back into the one that may mint a credential.
 */
export const isSessionOpener = (candidate: string): candidate is SessionOpener =>
  (SESSION_OPENERS as readonly string[]).includes(candidate);

export interface NewSession {
  readonly id: string;
  readonly tokenHash: string;
  readonly userId: string;
  readonly now: Date;
  readonly openedWith: SessionOpener;
  readonly ttlMs?: number | undefined;
}

/**
 * What a session IS, written once.
 *
 * Both doors build one — a password through `Login`, a passkey through
 * `FinishPasskeyAuthentication` — and they must build the SAME thing, because
 * ADR 6's whole claim is that there is one mechanism. Two constructors would
 * be two places for the expiry to drift apart, and the drift would be
 * invisible: both would work, and one of them would last a different number of
 * days for no reason anybody could see.
 */
export const openSession = (opened: NewSession): Session => ({
  id: opened.id,
  tokenHash: opened.tokenHash,
  userId: opened.userId,
  createdAt: opened.now,
  expiresAt: new Date(opened.now.getTime() + (opened.ttlMs ?? SESSION_TTL_MS)),
  createdWith: opened.openedWith,
});

/**
 * ## How long a session lives: 30 days, sliding
 *
 * The real control here is revocation, not expiry. The token is opaque and
 * server-side, so "log this device out" is a `DELETE` that takes effect on the
 * very next request. That is something a JWT cannot do without rebuilding this
 * table, and it is why the lifetime can afford to be generous.
 *
 * 30 days of idle time, pushed forward whenever the session is used. The user
 * is a household member opening the app to find a drill bit, from a phone, in
 * a garage, possibly with one hand. A short expiry there does not buy security:
 * it trains people to type a password so often that they pick a shorter one, or
 * to write it down. The threat that actually matters is a lost phone, and the
 * answer to a lost phone is revoking its session, not waiting for it to lapse.
 *
 * It is capped rather than infinite so that a device nobody has touched in a
 * month — sold, lost, reinstalled — stops being a way in on its own.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How much of the lifetime must have been consumed before the sliding renewal
 * bothers to write.
 *
 * Extending the expiry on EVERY request would turn every authenticated read
 * into a write, which on a single SQLite file is the one thing worth avoiding.
 * At a day's granularity the renewal costs at most one write per device per
 * day, and a user would have to leave the app untouched for 30 days to notice
 * the difference.
 */
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
