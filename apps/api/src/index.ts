/**
 * `@ariadna/api` — the adapters that implement the `@ariadna/domain` ports.
 *
 * This package currently contains the persistence layer only. HTTP, QR code
 * generation and photo file handling are separate work units and deliberately
 * absent.
 */

// Ports implemented with the platform
export { SystemClock } from "./adapters/system-clock.js";
export { UuidIdGenerator } from "./adapters/uuid-id-generator.js";
export {
  Base32PublicIdGenerator,
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
} from "./adapters/public-id-generator.js";

// Ports implemented with Prisma + SQLite
export { createPrismaClient } from "./persistence/prisma-client.js";
export {
  MAX_STORAGE_UNIT_ANCESTOR_DEPTH,
  PrismaStorageUnitRepository,
} from "./persistence/prisma-storage-unit-repository.js";
export { PrismaItemRepository } from "./persistence/prisma-item-repository.js";
export {
  CorruptStorageUnitHierarchy,
  UnknownStorageUnitKind,
} from "./persistence/persistence-errors.js";
