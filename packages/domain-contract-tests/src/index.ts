/**
 * Shared, reusable contract suites for the `@ariadna/domain` repository ports.
 *
 * This package exists so the suites can be consumed BOTH by the in-memory
 * repositories that ship inside `@ariadna/domain` and by the Prisma adapters in
 * `@ariadna/api`, without `@ariadna/domain` ever gaining a dependency — runtime
 * or otherwise — on a test framework. The domain stays a leaf of the dependency
 * graph; the test harness is a consumer of it, like every other adapter.
 */
export {
  A_LATER_MOMENT,
  A_MOMENT,
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
  ItemRepositoryContext,
  PhotoRepositoryContext,
  RepositoryHarness,
  SearchRepositoryContext,
  StorageUnitRepositoryContext,
} from "./harness.js";
export { storageUnitRepositoryContract } from "./storage-unit-repository.contract.js";
export { itemRepositoryContract } from "./item-repository.contract.js";
export { photoRepositoryContract } from "./photo-repository.contract.js";
export { searchRepositoryContract } from "./search-repository.contract.js";
export { domainUseCaseContract } from "./domain-use-case.contract.js";
