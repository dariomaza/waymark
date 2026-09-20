/**
 * # The contract with Ariadna's API, shared by both clients
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
 */
export {
  ApiError,
  ApiErrorCode,
  detailNumber,
  failureKindOf,
  FailureKind,
  isApiErrorWithCode,
  OFFLINE_STATUS,
} from "./api-error.js";
export { describeFailure, failureTone } from "./describe-failure.js";
export {
  createAriadnaClient,
  PHOTO_FIELD_NAME,
  type AppendPhoto,
  type AriadnaClient,
  type AriadnaClientOptions,
} from "./ariadna-client.js";
export { INVENTORY_ROOTS, queryKeys } from "./query-keys.js";
export type {
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
  MovedItemsResponse,
  PhotoView,
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
  UpdateItemInput,
  UpdateStorageUnitInput,
  UserView,
} from "./contract.js";
