/**
 * Test-only surface of `@ariadna/domain`, reachable as `@ariadna/domain/testing`.
 *
 * The in-memory repositories and the deterministic clock/id generators are real,
 * working implementations of the ports. They are the reference against which
 * every other adapter is measured, so they have to be importable from outside
 * this package. They stay OUT of `./index.ts` on purpose: production code must
 * never be able to reach them by accident.
 *
 * Nothing here adds a runtime dependency; these are the same zero-dependency
 * files the domain's own tests use.
 */
export { FakeClock } from "./shared/clock.fake.js";
export {
  SequentialIdGenerator,
  SequentialPublicIdGenerator,
} from "./shared/id-generator.fake.js";
export { InMemoryStorageUnitRepository } from "./storage-units/storage-unit-repository.fake.js";
export { InMemoryItemRepository } from "./items/item-repository.fake.js";
export { InMemoryPhotoRepository } from "./photos/photo-repository.fake.js";
