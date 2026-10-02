/**
 * Shared, reusable contract suites for the `@waymark/domain` repository ports.
 *
 * This package exists so the suites can be consumed BOTH by the in-memory
 * repositories that ship inside `@waymark/domain` and by the Prisma adapters in
 * `@waymark/api`, without `@waymark/domain` ever gaining a dependency — runtime
 * or otherwise — on a test framework. The domain stays a leaf of the dependency
 * graph; the test harness is a consumer of it, like every other adapter.
 */
export {
  A_LATER_MOMENT,
  A_MOMENT,
  AN_OWNER,
  ANOTHER_OWNER,
  CONTRACT_PEOPLE,
  aChainOfStorageUnits,
  aPhotoId,
  aStorageUnit,
  aUnitId,
  anItem,
  anItemId,
  sortedIds,
  type ItemOverrides,
  type StorageUnitOverrides,
} from "./builders.js";
export type {
  DomainUseCaseContext,
  InvisibilityContext,
  ItemRepositoryContext,
  PhotoRepositoryContext,
  RepositoryHarness,
  SearchRepositoryContext,
  ShareRepositoryContext,
  StorageUnitRepositoryContext,
} from "./harness.js";
export { storageUnitRepositoryContract } from "./storage-unit-repository.contract.js";
export { itemRepositoryContract } from "./item-repository.contract.js";
export { photoRepositoryContract } from "./photo-repository.contract.js";
export { searchRepositoryContract } from "./search-repository.contract.js";
export { shareRepositoryContract } from "./share-repository.contract.js";
export { domainUseCaseContract } from "./domain-use-case.contract.js";
export { invisibilityContract } from "./invisibility.contract.js";
export { whatEachPersonMayChangeContract } from "./what-each-person-may-change.contract.js";
export { aNarrowedTokenContract } from "./a-narrowed-token.contract.js";
