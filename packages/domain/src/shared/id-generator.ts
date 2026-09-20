import type { PublicId } from "./identity.js";

/**
 * Produces opaque internal identifiers. Callers brand the result for the
 * concept they are creating, so the domain never depends on a uuid library.
 */
export interface IdGenerator {
  next(): string;
}

/**
 * Produces the public identifier printed on a storage unit QR code. It is a
 * separate port because it is user-facing: short, unambiguous and stable.
 */
export interface PublicIdGenerator {
  next(): PublicId;
}
