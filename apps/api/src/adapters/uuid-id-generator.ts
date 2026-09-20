import { randomUUID } from "node:crypto";

import type { IdGenerator } from "@ariadna/domain";

/**
 * Internal identifiers, from the platform's own CSPRNG.
 *
 * These ids are never shown to a human and never printed on a label, so
 * readability does not matter: what matters is that they can be generated
 * client-side or across processes without coordination, which rules out
 * database sequences. `node:crypto` keeps the API free of a uuid dependency.
 *
 * The user-facing identifier is a different port on purpose: see
 * `Base32PublicIdGenerator`.
 */
export class UuidIdGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
