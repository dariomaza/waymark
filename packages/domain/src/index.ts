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
  reviseStorageUnit,
  setStorageUnitPhoto,
  StorageUnitKind,
  type CreateStorageUnitInput,
  type StorageUnit,
  type StorageUnitRevision,
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
  UpdateStorageUnit,
  type UpdateStorageUnitCommand,
  type UpdateStorageUnitDependencies,
} from "./storage-units/update-storage-unit.js";
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
  attachPhotoToItem,
  coverPhotoId,
  createItem,
  detachPhotoFromItem,
  MAX_ITEM_PHOTOS,
  moveItemTo,
  reorderItemPhotos,
  reviseItem,
  type CreateItemInput,
  type Item,
  type ItemRevision,
} from "./items/item.js";
export type { ItemRepository } from "./items/item-repository.js";
export {
  InvalidQuantity,
  ItemNotFound,
  PhotoNotOnItem,
  TooManyItemPhotos,
} from "./items/item-errors.js";
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
  UpdateItem,
  type UpdateItemCommand,
  type UpdateItemDependencies,
} from "./items/update-item.js";
export {
  DeleteItem,
  type DeleteItemDependencies,
  type DeleteItemResult,
} from "./items/delete-item.js";

// Search
export {
  foldSearchText,
  searchTokensOf,
  toSearchTerms,
} from "./search/search-text.js";
export {
  compareSearchMatches,
  matchItem,
  matchStorageUnit,
  SearchMatchField,
  type SearchMatch,
} from "./search/search-match.js";
export type { SearchRepository } from "./search/search-repository.js";
export {
  DEFAULT_SEARCH_LIMIT,
  SearchInventory,
  type ItemSearchResult,
  type SearchInventoryCommand,
  type SearchInventoryDependencies,
  type SearchInventoryResult,
  type StorageUnitSearchResult,
} from "./search/search-inventory.js";

// Photos
export type { PhotoRepository } from "./photos/photo-repository.js";
export type { ImageProcessor } from "./photos/image-processor.js";
export {
  AttachItemPhoto,
  type AttachItemPhotoCommand,
  type AttachItemPhotoDependencies,
  type AttachItemPhotoResult,
} from "./photos/attach-item-photo.js";
export {
  DetachItemPhoto,
  type DetachItemPhotoCommand,
  type DetachItemPhotoDependencies,
  type DetachItemPhotoResult,
} from "./photos/detach-item-photo.js";
export {
  ReorderItemPhotos,
  type ReorderItemPhotosCommand,
  type ReorderItemPhotosDependencies,
} from "./photos/reorder-item-photos.js";
export {
  SetStorageUnitPhoto,
  type SetStorageUnitPhotoCommand,
  type SetStorageUnitPhotoDependencies,
  type SetStorageUnitPhotoResult,
} from "./photos/set-storage-unit-photo.js";
export {
  createPhoto,
  displayPathOf,
  markPhotoFailed,
  markPhotoPending,
  markPhotoProcessed,
  markPhotoSkipped,
  PhotoProcessingStatus,
  type CreatePhotoInput,
  type Photo,
} from "./photos/photo.js";
