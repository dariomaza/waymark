import { randomBytes } from "node:crypto";

import { publicId, type PublicId, type PublicIdGenerator } from "@ariadna/domain";

/**
 * Crockford's Base32 alphabet: the digits plus the upper case letters, minus
 * `I`, `L`, `O` and `U`.
 *
 * - `I` and `L` are misread as `1`, `O` as `0`, `U` as `V`. A public id ends up
 *   printed under a QR code and read aloud across a garage ("is that box
 *   O-2-I-7?"), so the confusable characters have to go.
 * - `U` also drops out because removing it makes accidental English profanity
 *   in a random id essentially impossible.
 * - Upper case only and alphanumeric only: that is exactly the character set of
 *   the QR "alphanumeric" encoding mode, which stores ~5.5 bits per character
 *   instead of the 8 bits of byte mode. The symbol stays smaller and prints
 *   readably on a cheap label.
 * - Alphanumeric also means URL safe with no percent encoding, so the id drops
 *   straight into `/u/{publicId}`.
 *
 * Exactly 32 symbols, which is what makes the generator below unbiased.
 */
export const PUBLIC_ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * 10 symbols over a 32 character alphabet = 5 bits each = **50 bits** of
 * entropy, about 1.13e15 distinct ids.
 *
 * Collision estimate, birthday approximation `n^2 / 2N`:
 *
 * | storage units | probability of ANY collision |
 * | ------------- | ---------------------------- |
 * | 1,000         | ~4.4e-10                     |
 * | 10,000        | ~4.4e-8                      |
 * | 100,000       | ~4.4e-6  (1 in ~227,000)     |
 *
 * A homelab inventory tops out in the low thousands of units. Even at a
 * hundred thousand — an order of magnitude past "realistic" — a collision is a
 * one-in-two-hundred-thousand event, and the database's unique index on
 * `publicId` turns it into a failed insert rather than a mislabelled box.
 *
 * 10 was chosen over 8 (40 bits, ~0.45% at 100k units — too close for
 * comfort once the id is physically printed and glued to a box) and over 12
 * (60 bits, needlessly long on a label for no practical gain).
 */
export const PUBLIC_ID_LENGTH = 10;

/**
 * The public identifier printed on a storage unit QR code.
 *
 * It is a separate port from `IdGenerator` because its constraints are
 * human-facing rather than technical: short enough to print, unambiguous
 * enough to read aloud, URL safe enough to live in a path segment.
 */
export class Base32PublicIdGenerator implements PublicIdGenerator {
  next(): PublicId {
    const bytes = randomBytes(PUBLIC_ID_LENGTH);
    let value = "";

    for (const byte of bytes) {
      // 256 is an exact multiple of 32, so masking the low five bits maps each
      // byte onto the alphabet with no modulo bias: every symbol is the image
      // of exactly eight byte values.
      value += PUBLIC_ID_ALPHABET[byte & 0b1_1111];
    }

    return publicId(value);
  }
}
