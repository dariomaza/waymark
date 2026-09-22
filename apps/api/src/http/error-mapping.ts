import {
  CyclicStorageUnitMove,
  InvalidQuantity,
  ItemNotFound,
  MissingEmptyTarget,
  PhotoNotOnItem,
  StorageUnitNotEmpty,
  StorageUnitNotFound,
  TooManyItemPhotos,
  type DomainError,
} from "@waymark/domain";

import {
  CorruptStorageUnitHierarchy,
  UnknownPhotoProcessingStatus,
  UnknownStorageUnitKind,
} from "../persistence/persistence-errors.js";

export interface MappedDomainError {
  readonly status: number;
  /** Stable, machine readable. Clients branch on this, never on the message. */
  readonly code: string;
  readonly details?: Record<string, unknown>;
}

/**
 * # Domain error to HTTP status
 *
 * | Domain error                   | Status | Why                                                                |
 * | ------------------------------ | ------ | ------------------------------------------------------------------ |
 * | `StorageUnitNotFound` (in URL) | 404    | The addressed resource does not exist.                              |
 * | `StorageUnitNotFound` (in body)| 422    | The endpoint exists; a value inside the request names nothing.      |
 * | `ItemNotFound` (in URL)        | 404    | Same rule, applied to items.                                        |
 * | `ItemNotFound` (in body)       | 422    | e.g. one unknown id inside a bulk move.                             |
 * | `StorageUnitNotEmpty`          | 409    | Legal request, refused by the CURRENT state of the unit (ADR 3).    |
 * | `CyclicStorageUnitMove`        | 409    | Legal request, refused by the CURRENT shape of the tree (ADR 2).    |
 * | `MissingEmptyTarget`           | 422    | The request is incomplete; the caller must supply a target.         |
 * | `InvalidQuantity`              | 422    | Well formed JSON, value the domain refuses.                         |
 * | `TooManyItemPhotos`            | 409    | Refused by the CURRENT contents of the item (see below).            |
 * | `PhotoNotOnItem`               | 422    | The request names a photo this item does not hold.                  |
 * | `CorruptStorageUnitHierarchy`  | 500    | The stored data is broken. Nothing the caller sent is wrong.        |
 * | `UnknownStorageUnitKind`       | 500    | Same: a column holds something the domain says cannot exist.        |
 * | `UnknownPhotoProcessingStatus` | 500    | Same, for a photo row that contradicts itself.                      |
 *
 * ## The rule behind 404, 409 and 422
 *
 * - **404** — the thing the URL points at is not there. Only ids that appear in
 *   the path qualify; a 404 for a body value would be a claim about the route.
 * - **409** — the request is understood, complete and refers to things that
 *   exist, and the server refuses because of the state of the WORLD. The same
 *   bytes would succeed after somebody else changes something: empty the box,
 *   move the target out of the subtree. "Fix the world, then retry."
 * - **422** — the request is understood and syntactically valid, and the server
 *   refuses because of the REQUEST. Nothing anybody else does will make these
 *   exact bytes succeed. "Fix the request, then retry."
 *
 * `TooManyItemPhotos` is a 409 by the same rule that makes `StorageUnitNotEmpty`
 * one: the item is full RIGHT NOW. Delete a photo and the identical upload
 * succeeds, with nothing about the request changed. `PhotoNotOnItem` is a 422
 * because the photo id came from the body and no amount of waiting makes those
 * exact bytes name a photo this item holds.
 *
 * `MissingEmptyTarget` is the interesting one. It depends on state — the unit is
 * a root and holds items — so 409 is arguable. It is a 422 because the fix is
 * to send `targetUnitId`, not to wait for the world to change, and the status
 * code is advice to the caller about what to do next.
 *
 * ## Why 500 is spelled out rather than left to fall through
 *
 * `CorruptStorageUnitHierarchy` and `UnknownStorageUnitKind` are `DomainError`s
 * that mean the DATABASE is wrong, not the caller. They get a deliberate 500
 * with a code of their own, so "the server is broken" is a diagnosis in the
 * response rather than an inference from a stack trace. Their details are
 * withheld: a caller can do nothing with them, and they describe stored data.
 */
type Mapper = (
  error: DomainError,
  addressedIds: ReadonlySet<string>,
) => MappedDomainError;

/**
 * An id the URL points at is "addressed"; everything else arrived in the body.
 * `request.params` IS that set, so nothing has to be tracked by hand.
 */
const notFoundOrUnprocessable = (
  id: string,
  addressedIds: ReadonlySet<string>,
): number => (addressedIds.has(id) ? 404 : 422);

const MAPPINGS = new Map<unknown, Mapper>([
  [
    StorageUnitNotFound,
    (error, addressedIds): MappedDomainError => {
      const { id } = error as StorageUnitNotFound;
      return {
        status: notFoundOrUnprocessable(id, addressedIds),
        code: "STORAGE_UNIT_NOT_FOUND",
        details: { storageUnitId: id },
      };
    },
  ],
  [
    ItemNotFound,
    (error, addressedIds): MappedDomainError => {
      const { id } = error as ItemNotFound;
      return {
        status: notFoundOrUnprocessable(id, addressedIds),
        code: "ITEM_NOT_FOUND",
        details: { itemId: id },
      };
    },
  ],
  [
    StorageUnitNotEmpty,
    (error): MappedDomainError => {
      const { id, itemCount, childUnitCount } = error as StorageUnitNotEmpty;
      return {
        status: 409,
        code: "STORAGE_UNIT_NOT_EMPTY",
        details: { storageUnitId: id, itemCount, childUnitCount },
      };
    },
  ],
  [
    CyclicStorageUnitMove,
    (error): MappedDomainError => {
      const { id, targetParentId } = error as CyclicStorageUnitMove;
      return {
        status: 409,
        code: "CYCLIC_STORAGE_UNIT_MOVE",
        details: { storageUnitId: id, targetParentId },
      };
    },
  ],
  [
    MissingEmptyTarget,
    (error): MappedDomainError => {
      const { id, itemCount } = error as MissingEmptyTarget;
      return {
        status: 422,
        code: "MISSING_EMPTY_TARGET",
        details: { storageUnitId: id, itemCount },
      };
    },
  ],
  [
    InvalidQuantity,
    (error): MappedDomainError => ({
      status: 422,
      code: "INVALID_QUANTITY",
      details: { quantity: (error as InvalidQuantity).quantity },
    }),
  ],
  [
    TooManyItemPhotos,
    (error): MappedDomainError => {
      const { id, limit, photoCount } = error as TooManyItemPhotos;
      return {
        status: 409,
        code: "TOO_MANY_ITEM_PHOTOS",
        details: { itemId: id, limit, photoCount },
      };
    },
  ],
  [
    PhotoNotOnItem,
    (error): MappedDomainError => {
      const { id, photoId } = error as PhotoNotOnItem;
      return {
        status: 422,
        code: "PHOTO_NOT_ON_ITEM",
        details: { itemId: id, photoId },
      };
    },
  ],
  [
    UnknownPhotoProcessingStatus,
    (): MappedDomainError => ({
      status: 500,
      code: "UNKNOWN_PHOTO_PROCESSING_STATUS",
    }),
  ],
  [
    CorruptStorageUnitHierarchy,
    (): MappedDomainError => ({
      status: 500,
      code: "CORRUPT_STORAGE_UNIT_HIERARCHY",
    }),
  ],
  [
    UnknownStorageUnitKind,
    (): MappedDomainError => ({
      status: 500,
      code: "UNKNOWN_STORAGE_UNIT_KIND",
    }),
  ],
]);

/**
 * `null` means "this table has never heard of that error", which is a bug in
 * the table rather than a shrug. The completeness test in `error-mapping.test.ts`
 * makes sure `null` cannot happen for any error the domain actually exports.
 */
export const mapDomainError = (
  error: DomainError,
  addressedIds: ReadonlySet<string>,
): MappedDomainError | null =>
  MAPPINGS.get(error.constructor)?.(error, addressedIds) ?? null;
