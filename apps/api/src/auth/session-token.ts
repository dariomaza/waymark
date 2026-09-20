import { createHash, randomBytes } from "node:crypto";

/**
 * 32 bytes = 256 bits. A token is a bearer credential with no structure to
 * attack, so its only defence is being impossible to guess; at this size,
 * guessing one is not a threat model.
 */
export const SESSION_TOKEN_BYTES = 32;

export interface IssuedSessionToken {
  /** Handed to the client exactly once. The server never stores this. */
  readonly token: string;
  /** What goes in the database, and what a presented token is looked up by. */
  readonly tokenHash: string;
}

export const issueSessionToken = (): IssuedSessionToken => {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");

  return { token, tokenHash: hashSessionToken(token) };
};

/**
 * SHA-256, deliberately NOT a password KDF.
 *
 * A password is short, human-chosen and therefore guessable, which is what a
 * slow memory-hard hash defends against. A session token is 256 uniform random
 * bits: there is no dictionary and no structure, so stretching it buys nothing
 * and would add the KDF's cost to EVERY authenticated request rather than to
 * one login. The hash exists for one reason: a dump of the session table must
 * not contain credentials that still work.
 */
export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");
