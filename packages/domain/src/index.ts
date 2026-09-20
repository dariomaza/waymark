// Shared building blocks
export { DomainError } from "./shared/domain-error.js";
export type { Clock } from "./shared/clock.js";
export type { IdGenerator, PublicIdGenerator } from "./shared/id-generator.js";
export {
  itemId,
  photoId,
  publicId,
  unitId,
  type ItemId,
  type PhotoId,
  type PublicId,
  type UnitId,
} from "./shared/identity.js";

// Storage units
export {
  createStorageUnit,
  reparentStorageUnit,
  StorageUnitKind,
  type CreateStorageUnitInput,
  type StorageUnit,
} from "./storage-units/storage-unit.js";
export type { StorageUnitRepository } from "./storage-units/storage-unit-repository.js";
export {
  CyclicStorageUnitMove,
  MissingEmptyTarget,
  StorageUnitNotEmpty,
  StorageUnitNotFound,
} from "./storage-units/storage-unit-errors.js";
export { assertStorageUnitMoveIsAcyclic } from "./storage-units/storage-unit-cycle.js";
export {
  CreateStorageUnit,
  type CreateStorageUnitCommand,
  type CreateStorageUnitDependencies,
} from "./storage-units/create-storage-unit.js";
export {
  MoveStorageUnit,
  type MoveStorageUnitCommand,
  type MoveStorageUnitDependencies,
} from "./storage-units/move-storage-unit.js";
export {
  DeleteStorageUnit,
  type DeleteStorageUnitDependencies,
} from "./storage-units/delete-storage-unit.js";
export {
  EmptyStorageUnit,
  type EmptyStorageUnitDependencies,
  type EmptyStorageUnitResult,
} from "./storage-units/empty-storage-unit.js";
export {
  formatStorageUnitPath,
  GetStorageUnitPath,
  STORAGE_UNIT_PATH_SEPARATOR,
  type GetStorageUnitPathDependencies,
} from "./storage-units/get-storage-unit-path.js";

// Items
export {
  coverPhotoId,
  createItem,
  moveItemTo,
  type CreateItemInput,
  type Item,
} from "./items/item.js";
export type { ItemRepository } from "./items/item-repository.js";
export { InvalidQuantity, ItemNotFound } from "./items/item-errors.js";
export {
  CreateItem,
  type CreateItemCommand,
  type CreateItemDependencies,
} from "./items/create-item.js";
export {
  MoveItems,
  type MoveItemsCommand,
  type MoveItemsDependencies,
} from "./items/move-items.js";
export {
  DeleteItem,
  type DeleteItemDependencies,
  type DeleteItemResult,
} from "./items/delete-item.js";

// Photos
export {
  createPhoto,
  displayPathOf,
  markPhotoFailed,
  markPhotoProcessed,
  markPhotoSkipped,
  PhotoProcessingStatus,
  type CreatePhotoInput,
  type Photo,
} from "./photos/photo.js";
