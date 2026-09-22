/**
 * # The contract with Waymark's API, shared by both clients
 *
 * There is one API and two clients (README), and the reason Expo was chosen
 * over native Kotlin was that the Android app would SHARE this rather than be
 * a second implementation of it. This package is that sharing, written down.
 *
 * What lives here is everything that is true of the API regardless of what is
 * drawing it: the JSON shapes it answers with, the refusals it makes and how
 * to tell them apart (ADR 8), the one module that speaks HTTP, and the cache
 * keys the inventory graph implies.
 *
 * What deliberately does NOT live here is anything that would make this
 * package depend on a platform or on a framework:
 *
 * - **React.** The provider that injects a client and the hook that
 *   invalidates the cache are eight lines each and live in each app, which is
 *   what keeps this package a zero-dependency TypeScript module that Vite and
 *   Metro can both read without a build step.
 * - **Where the token is kept.** The browser has `localStorage`, tabs that
 *   must agree, and a `storage` event; a phone has an encrypted keystore and
 *   an async read. Those are two different behaviours, so they are two
 *   implementations rather than one interface pretending.
 * - **What a photo IS on the way up.** See `AppendPhoto`.
 * - **The words.** A refusal's CODE is a contract between two machines and
 *   never changes language; the SENTENCE it becomes is read by a person and
 *   has to change. Those sentences used to live here, in English. They live in
 *   `@waymark/i18n` now, which depends on this package — the api client knows
 *   what the machine said, and that one knows what to tell the person.
 */
export {
  ApiError,
  ApiErrorCode,
  detailNumber,
  failureKindOf,
  FailureKind,
  failureTone,
  isApiErrorWithCode,
  OFFLINE_STATUS,
} from "./api-error.js";
export { initialsOf } from "./initials.js";
export {
  createWaymarkClient,
  PHOTO_FIELD_NAME,
  type AppendPhoto,
  type WaymarkClient,
  type WaymarkClientOptions,
} from "./waymark-client.js";
export { movedEarlier, withCoverFirst } from "./photo-order.js";
export { INVENTORY_ROOTS, queryKeys } from "./query-keys.js";
export { publicIdFromScannedText } from "./scanned-label.js";
export {
  findById,
  findByPublicId,
  flattenUnits,
  subtreeOf,
  type FlatUnit,
} from "./storage-unit-tree.js";
export type {
  AbandonedPhotoView,
  CreateItemInput,
  CreateStorageUnitInput,
  Credentials,
  DetachedItemPhotoResponse,
  DetachedStorageUnitPhotoResponse,
  EmptyStorageUnitResponse,
  ItemAtLocationView,
  ItemDetailResponse,
  ItemListResponse,
  ItemPhotoResponse,
  ItemResponse,
  ItemSearchResultView,
  ItemView,
  ImageProcessorStatusView,
  MovedItemsResponse,
  PhotoProcessingResponse,
  PhotoView,
  RequeuedPhotoResponse,
  RequeuedPhotosResponse,
  ReleasedPhotosResponse,
  SearchQuery,
  SearchResponse,
  SessionView,
  StorageUnitDetailResponse,
  StorageUnitPhotoResponse,
  StorageUnitResponse,
  StorageUnitSearchResultView,
  StorageUnitTreeResponse,
  StorageUnitTreeView,
  StorageUnitView,
  StorageUnitWithPhotoView,
  UpdateItemInput,
  UpdateStorageUnitInput,
  UserView,
} from "./contract.js";
