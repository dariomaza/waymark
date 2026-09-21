import type {
  ItemId,
  PhotoId,
  PhotoProcessingStatus,
  PublicId,
  SearchMatchField,
  StorageUnitKind,
  UnitId,
} from "@ariadna/domain";

/**
 * # What the API promises, written down once
 *
 * These are the JSON shapes `apps/api/src/http/views.ts` sends, mirrored here
 * so that the rest of the client never touches an `any` that came off the
 * wire. They are views, not entities: the API projects its domain by hand
 * precisely so a rename inside it is not a breaking change out here, and
 * copying that projection is what keeps this client honest about the
 * difference.
 *
 * The ids are the domain's branded ones. They serialise as plain strings, so
 * this costs nothing at runtime and buys the one thing a client of a tree of
 * units and items needs most: a unit id cannot be passed where an item id was
 * meant. Reusing `@ariadna/domain` for exactly this — ids, kinds, statuses,
 * match fields — is the whole of what a client may borrow from the domain. No
 * rule ever crosses: the API decides whether a box can be deleted, and this
 * app renders the answer, including the refusal.
 *
 * Timestamps arrive as ISO 8601 strings in UTC and are kept that way. A screen
 * that wants a `Date` makes one; a cache key that holds a `Date` is a cache key
 * that changes when nothing did.
 */

/**
 * A storage unit as a ROW: a step in a breadcrumb, a child, a node of the
 * tree, a search hit, the unit an item sits in.
 *
 * No photo, and no photo id either. An id is not a picture — a client holding
 * one has to build `/photos/<id>` by hand, which is what `PhotoView` exists
 * to stop, and it says nothing about whether the bytes have settled (ADR 4).
 * Nothing draws a row's photo, so carrying the id only ever invited somebody
 * to construct a URL. See `StorageUnitWithPhotoView`.
 */
export interface StorageUnitView {
  readonly id: UnitId;
  readonly parentId: UnitId | null;
  readonly name: string;
  readonly kind: StorageUnitKind;
  readonly description: string | null;
  /** Ten characters of Crockford Base32; what a QR on a box encodes. */
  readonly publicId: PublicId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A storage unit as the SUBJECT of an answer: its own screen, and the unit a
 * patch, a move or a photo upload just changed.
 *
 * Here the photo is worth its bytes, and it is the whole photo, exactly as an
 * item's are. `null` means the unit has no photo; the key is always present,
 * so a client can tell that from an answer that does not carry one.
 */
export interface StorageUnitWithPhotoView extends StorageUnitView {
  readonly photo: PhotoView | null;
}

export interface StorageUnitTreeView extends StorageUnitView {
  readonly children: readonly StorageUnitTreeView[];
}

export interface ItemView {
  readonly id: ItemId;
  readonly storageUnitId: UnitId;
  readonly name: string;
  readonly description: string | null;
  readonly quantity: number;
  readonly tags: readonly string[];
  /**
   * Ordered, and whole photos rather than ids: the first one is the cover,
   * which is why choosing one is a reorder (ADR 9).
   *
   * Each one carries its own `url`, `thumbnailUrl` and `processingStatus`, so
   * this app builds no photo URL and can say which picture is still waiting
   * for a background removal that may never happen (ADR 4).
   */
  readonly photos: readonly PhotoView[];
  readonly coverPhotoId: PhotoId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PhotoView {
  readonly id: PhotoId;
  /**
   * `PENDING` is the normal state of a freshly uploaded photo and may be its
   * final one: background removal is optional and may not be installed at all
   * (ADR 4). Nothing in this client waits for `DONE`.
   */
  readonly processingStatus: PhotoProcessingStatus;
  readonly url: string;
  readonly thumbnailUrl: string;
}

export interface UserView {
  readonly id: string;
  readonly username: string;
}

export interface SessionView {
  readonly token: string;
  readonly expiresAt: string;
  readonly user: UserView;
}

export interface StorageUnitTreeResponse {
  readonly tree: readonly StorageUnitTreeView[];
}

/** One screen in one response: the unit, its breadcrumb, and what it holds. */
export interface StorageUnitDetailResponse {
  readonly unit: StorageUnitWithPhotoView;
  readonly path: readonly StorageUnitView[];
  readonly children: readonly StorageUnitView[];
  readonly items: readonly ItemView[];
}

export interface StorageUnitResponse {
  readonly unit: StorageUnitWithPhotoView;
}

export interface EmptyStorageUnitResponse {
  readonly movedItems: readonly ItemView[];
  readonly movedChildUnits: readonly StorageUnitView[];
}

export interface ItemDetailResponse {
  readonly item: ItemView;
  readonly storageUnit: StorageUnitView | null;
  readonly path: readonly StorageUnitView[];
}

export interface ItemResponse {
  readonly item: ItemView;
}

/**
 * An item and where it is. The same two shapes a search hit carries, minus
 * `matchedFields` — nothing matched anything, this is the whole inventory.
 */
export interface ItemAtLocationView {
  /** Root first, ending at the unit that holds it. */
  readonly path: readonly StorageUnitView[];
  /** The same path already joined, `Garage > Metal wardrobe > Box 3`. */
  readonly location: string;
  readonly item: ItemView;
}

/**
 * Every item in the house, in one request. Unpaginated on purpose: see the
 * API's own reasoning in `item-routes.ts`, which is the same reading of a
 * homelab inventory that makes the whole forest one request too.
 */
export interface ItemListResponse {
  readonly items: readonly ItemAtLocationView[];
}

export interface MovedItemsResponse {
  readonly items: readonly ItemView[];
}

export interface ReleasedPhotosResponse {
  readonly releasedPhotoIds: readonly PhotoId[];
}

export interface ItemPhotoResponse {
  readonly photo: PhotoView;
  readonly item: ItemView;
}

export interface StorageUnitPhotoResponse {
  readonly photo: PhotoView;
  readonly unit: StorageUnitWithPhotoView;
  readonly releasedPhotoIds: readonly PhotoId[];
}

export interface DetachedItemPhotoResponse {
  readonly item: ItemView;
  readonly releasedPhotoIds: readonly PhotoId[];
}

export interface DetachedStorageUnitPhotoResponse {
  readonly unit: StorageUnitWithPhotoView;
  readonly releasedPhotoIds: readonly PhotoId[];
}

interface SearchResultView {
  /** Root first, ending at the unit that answers "where is it". */
  readonly path: readonly StorageUnitView[];
  /** The same path already joined, `Garage > Metal wardrobe > Box 3`. */
  readonly location: string;
  readonly matchedFields: readonly SearchMatchField[];
}

export interface ItemSearchResultView extends SearchResultView {
  readonly item: ItemView;
}

export interface StorageUnitSearchResultView extends SearchResultView {
  readonly unit: StorageUnitView;
}

/**
 * Items and units come back as two lists because they answer two different
 * questions — "where is my drill" and "where is Box 3". The API refuses to
 * invent a rule for interleaving them, and so does this client.
 */
export interface SearchResponse {
  readonly query: string;
  /** What the query folded into, so a client can say which words matched. */
  readonly terms: readonly string[];
  readonly items: readonly ItemSearchResultView[];
  readonly storageUnits: readonly StorageUnitSearchResultView[];
}

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

export interface CreateStorageUnitInput {
  readonly parentId: UnitId | null;
  readonly name: string;
  readonly kind: StorageUnitKind;
  readonly description: string | null;
}

/**
 * What an edit of a unit may say. Absent means "leave it alone"; `null` on
 * the description is how one is taken off.
 *
 * There is no `parentId`, in this type or on the route it feeds. Moving is
 * guarded by the subtree invariant (ADR 2), it is its own call, and the API
 * refuses the key rather than ignoring it.
 */
export interface UpdateStorageUnitInput {
  readonly name?: string;
  readonly kind?: StorageUnitKind;
  readonly description?: string | null;
}

/** The same bargain for an item: no `storageUnitId`, because moving is moving. */
export interface UpdateItemInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly quantity?: number;
  /** The COMPLETE list; a revision that could only add cannot remove. */
  readonly tags?: readonly string[];
}

export interface CreateItemInput {
  readonly storageUnitId: UnitId;
  readonly name: string;
  readonly description: string | null;
  readonly quantity: number;
  readonly tags: readonly string[];
}

export interface SearchQuery {
  readonly query: string;
  readonly within?: UnitId | undefined;
  readonly limit?: number | undefined;
}
