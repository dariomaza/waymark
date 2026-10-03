import { randomInt } from "node:crypto";

/**
 * # The password the server makes for a new or reset account (ADR 26, amended)
 *
 * An administrator never chooses a password that lasts. Creating an account
 * or resetting one generates a temporary password, shown once in the answer
 * to that request, and the person must replace it the first time they sign
 * in. So its job is narrow: to be read off one screen and typed into another,
 * on a phone, once — and to be unguessable for the short time it lives.
 *
 * ## The alphabet: 23 lower-case letters
 *
 * The 26 letters without `i`, `l` and `o`, which read as `1`, `1` and `0` in
 * many fonts and as each other in some. No digits and no capitals, so a phone
 * keyboard never has to change layer, and nobody has to ask "is that a zero?".
 */
export const TEMPORARY_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz";

/** Four groups of four: short enough to keep your place in, while typing. */
const GROUPS = 4;
const GROUP_LENGTH = 4;

/**
 * 16 independent, uniform draws from 23 letters: 16 × log2(23) ≈ 72.4 bits.
 *
 * At least 64 is the bar. This is an online secret, behind a login that is
 * rate limited and stored as an scrypt hash, so 64 bits is far beyond
 * what either an attacker at the door or one holding the database can search
 * before the person signs in and the password stops working. The hyphens add
 * nothing and are not counted.
 */
export const TEMPORARY_PASSWORD_ENTROPY_BITS =
  GROUPS * GROUP_LENGTH * Math.log2(TEMPORARY_PASSWORD_ALPHABET.length);

/**
 * A new temporary password, from the operating system's CSPRNG.
 *
 * `randomInt` rather than a byte taken modulo 23, which would make the first
 * letters of the alphabet slightly likelier than the rest: it rejects and
 * redraws, so every letter is exactly as likely as every other.
 *
 * The value is returned, hashed by the caller and sent once. It is never
 * logged, and never stored as it is.
 */
export const generateTemporaryPassword = (): string =>
  Array.from({ length: GROUPS }, () =>
    Array.from(
      { length: GROUP_LENGTH },
      () => TEMPORARY_PASSWORD_ALPHABET[randomInt(TEMPORARY_PASSWORD_ALPHABET.length)],
    ).join(""),
  ).join("-");
