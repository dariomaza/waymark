/** A live, revocable grant. Deleting the row is what revocation means. */
export interface Session {
  readonly id: string;
  /** SHA-256 of the token. The token itself is never stored. */
  readonly tokenHash: string;
  readonly userId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

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
