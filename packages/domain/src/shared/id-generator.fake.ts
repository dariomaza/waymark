import type { IdGenerator, PublicIdGenerator } from "./id-generator.js";
import { publicId, type PublicId } from "./identity.js";

/** Deterministic id generator for tests: `<prefix>-1`, `<prefix>-2`, ... */
export class SequentialIdGenerator implements IdGenerator {
  #issued = 0;

  constructor(private readonly prefix: string) {}

  next(): string {
    this.#issued += 1;
    return `${this.prefix}-${this.#issued}`;
  }
}

/** Deterministic public id generator for tests: `PUB-1`, `PUB-2`, ... */
export class SequentialPublicIdGenerator implements PublicIdGenerator {
  #issued = 0;

  next(): PublicId {
    this.#issued += 1;
    return publicId(`PUB-${this.#issued}`);
  }
}
