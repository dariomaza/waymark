/**
 * # What a machine token looks like, on the client's side of the wire
 *
 * A machine token is a credential for a program rather than a person
 * (ADR 17). The API mints it, hashes it and never gives it back; a consumer of
 * this package is handed one out of band — an environment variable, a compose
 * file — and its only job is to present it.
 *
 * So the one thing worth knowing out here is whether the string a consumer was
 * configured with could ever have been issued by this API at all. That is
 * pure structure, it is the same fact in every client, and knowing it early is
 * the difference between two very different sentences: "you pasted the wrong
 * thing into the variable" answered instantly and locally, and "the API says
 * no" answered after a round trip that was never going to succeed.
 *
 * This is deliberately NOT a security check. The secret is proved by the hash
 * lookup in `apps/api`, and nothing here can or should stand in for it. It is
 * the same reason the API itself checks the shape first: a string that was
 * never a machine token is refused without a query.
 */

/**
 * Every machine token starts with this.
 *
 * It is not what tells a machine token from a session token on the wire — the
 * `Authorization` scheme is (see `AuthScheme`). It is there because a machine
 * token is the one credential in this system that gets WRITTEN DOWN, into a
 * compose file or a `.env`, and whoever finds `WAYMARK_MACHINE_TOKEN=wmk_...`
 * months later can tell what they are holding without asking anybody.
 */
export const MACHINE_TOKEN_PREFIX = "wmk_";

/** base64url, which is what the API's `randomBytes(...).toString("base64url")` emits. */
const SECRET_PATTERN = /^[A-Za-z0-9_-]+$/u;

/**
 * Whether a presented string could ever have been issued as a machine token.
 *
 * Structure only. It says nothing about whether the token exists, has been
 * revoked or has expired — the API folds all three into one refusal on
 * purpose, so that telling a caller its token USED to work is not free
 * information for whoever stole it.
 */
export const looksLikeMachineToken = (token: string): boolean => {
  if (!token.startsWith(MACHINE_TOKEN_PREFIX)) {
    return false;
  }

  return SECRET_PATTERN.test(token.slice(MACHINE_TOKEN_PREFIX.length));
};
