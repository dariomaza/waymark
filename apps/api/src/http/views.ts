import {
  formatStorageUnitPath,
  type Item,
  type ItemSearchResult,
  type Photo,
  type PhotoId,
  type StorageUnit,
  type StorageUnitSearchResult,
} from "@waymark/domain";

import type { StorageUnitTreeNode } from "./storage-unit-tree.js";

/**
 * The JSON shapes the clients see.
 *
 * Domain entities are not serialised directly. A view is a promise to the web
 * PWA and the Android app; an entity is an internal model that is expected to
 * change. Writing the projection out by hand is what stops a rename in the
 * domain from silently becoming a breaking API change.
 *
 * Timestamps are ISO 8601 strings in UTC, so a client parses them the same way
 * on every platform.
 */
/**
 * A storage unit as a ROW: a breadcrumb step, a child, a node of the tree, a
 * search hit, the unit an item happens to sit in.
 *
 * It carries no photo, and it carries no `photoId` either. An id is not a
 * picture: a client holding one has to build `/photos/<id>` by hand, which is
 * the one thing `PhotoView` exists to stop, and it cannot see whether the
 * bytes have settled (ADR 4). Nothing ever drew a row's photo, so the id was
 * a field that could only be used wrongly — see `StorageUnitWithPhotoView`
 * for where a photo does belong.
 */
export interface StorageUnitView {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly kind: string;
  readonly description: string | null;
  readonly publicId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A storage unit as the SUBJECT of an answer: its own screen, the unit a
 * patch or a move just changed, the unit a photo was just put on.
 *
 * Only here is a photo worth its bytes, and here it is the whole photo —
 * `url`, `thumbnailUrl` and `processingStatus` — exactly as an item's photos
 * are (ADR 9). Extending the row view rather than replacing it is what keeps
 * the answer from splitting in two: `path`, `children` and `tree` stay the
 * slim rows they were, and one extra photo row is read only when a unit is
 * what the client asked about.
 */
export interface StorageUnitWithPhotoView extends StorageUnitView {
  readonly photo: PhotoView | null;
}

export interface ItemView {
  readonly id: string;
  readonly storageUnitId: string;
  readonly name: string;
  readonly description: string | null;
  readonly quantity: number;
  readonly tags: readonly string[];
  /**
   * Whole photos, ordered, not their ids.
   *
   * Ids were the cheaper projection and they were the wrong one. A client
   * holding an id has to build `/photos/<id>` by hand — which is exactly what
   * `PhotoView` exists to stop, three lines further down — and it cannot see
   * `processingStatus` at all, so a photo still waiting for background
   * removal (ADR 4) looks identical to one that is finished, and the screen
   * has nothing true to say about it.
   */
  readonly photos: readonly PhotoView[];
  /** `photos[0].id`, spelled out so a list screen does not have to know that. */
  readonly coverPhotoId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A photo never exposes its stored path.
 *
 * The path is where a file happens to sit inside a volume the client cannot
 * reach, and publishing it would leak the layout and invite somebody to
 * construct one. What a client needs is the two URLs, spelled out here so no
 * client ever has to build them — and so changing the route is not a breaking
 * change for the PWA and the Android app at the same time.
 */
export interface PhotoView {
  readonly id: string;
  readonly processingStatus: string;
  /** Full size, already background-removed if that ever happened (ADR 4). */
  readonly url: string;
  /** What a list screen should use. See `photo-ingestion.ts`. */
  readonly thumbnailUrl: string;
}

export interface StorageUnitTreeView extends StorageUnitView {
  readonly children: readonly StorageUnitTreeView[];
}

/**
 * A search result is a thing AND where it is. The path is the answer, not a
 * decoration on it: "you own a cordless drill" is something the person
 * already knew, and "it is in Box 3 of the metal wardrobe in the garage" is
 * the reason this product exists.
 *
 * It ships in both shapes on purpose. `path` is the units themselves, so a
 * client can make every step of the breadcrumb tappable; `location` is the
 * same thing already joined, so a list row does not have to.
 *
 * `matchedFields` says WHY the result is there — a client can show "tagged
 * cables" next to an item whose name says nothing about cables. The relevance
 * score is deliberately not exposed: the ORDER is the promise, and a number
 * clients could re-sort by would freeze a ranking rule that is meant to be
 * improved.
 */
interface SearchResultView {
  /** Root first, ending at the unit that answers "where is it". */
  readonly path: readonly StorageUnitView[];
  /** The same path as one string, `Garage > Metal wardrobe > Box 3`. */
  readonly location: string;
  readonly matchedFields: readonly string[];
}

export interface ItemSearchResultView extends SearchResultView {
  readonly item: ItemView;
}

/**
 * An item and where it is, for the flat list of everything in the house.
 *
 * The same two shapes a search hit carries, minus `matchedFields`, because
 * nothing here matched anything — it is the whole inventory. Sharing the
 * shape is deliberate: a client that can draw a search result can draw one of
 * these, and "a thing AND where it is" is the one sentence this product has.
 */
export interface ItemAtLocationView {
  readonly item: ItemView;
  /** Root first, ending at the unit that holds it. */
  readonly path: readonly StorageUnitView[];
  /** The same path already joined, `Garage > Metal wardrobe > Box 3`. */
  readonly location: string;
}

export interface StorageUnitSearchResultView extends SearchResultView {
  readonly unit: StorageUnitView;
}

export const storageUnitView = (unit: StorageUnit): StorageUnitView => ({
  id: unit.id,
  parentId: unit.parentId,
  name: unit.name,
  kind: unit.kind,
  description: unit.description,
  publicId: unit.publicId,
  createdAt: unit.createdAt.toISOString(),
  updatedAt: unit.updatedAt.toISOString(),
});

/**
 * The same row plus the photo it points at, resolved by the caller.
 *
 * `null` is spelled out rather than left off: a client checking `photo` has to
 * be able to tell "this unit has no photo" from "this answer does not carry
 * one", and an absent key says the second thing.
 */
export const storageUnitWithPhotoView = (
  unit: StorageUnit,
  photo: Photo | null,
): StorageUnitWithPhotoView => ({
  ...storageUnitView(unit),
  photo: photo === null ? null : photoView(photo),
});

/**
 * Projects an item, resolving its photo ids against rows the caller already
 * loaded. See `item-views.ts` for who loads them and in how many queries.
 *
 * A photo id with no row behind it is left OUT rather than projected as a
 * half-photo. The row is what says where the bytes are and whether they have
 * settled, so without one there is nothing a client could draw; the cover
 * follows the list, so it can never point at a photo that is not in it.
 */
export const itemView = (
  item: Item,
  photos: ReadonlyMap<PhotoId, Photo>,
): ItemView => {
  const held = item.photos.flatMap((id) => {
    const photo = photos.get(id);

    return photo === undefined ? [] : [photoView(photo)];
  });

  return {
    id: item.id,
    storageUnitId: item.storageUnitId,
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    tags: [...item.tags],
    photos: held,
    coverPhotoId: held[0]?.id ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
};

export const photoView = (photo: Photo): PhotoView => ({
  id: photo.id,
  processingStatus: photo.processingStatus,
  url: `/photos/${photo.id}`,
  thumbnailUrl: `/photos/${photo.id}/thumbnail`,
});

export const storageUnitTreeView = (
  node: StorageUnitTreeNode,
): StorageUnitTreeView => ({
  ...storageUnitView(node.unit),
  children: node.children.map(storageUnitTreeView),
});

/**
 * Takes the already-projected item rather than the entity, so the photos are
 * loaded once for the whole answer instead of once per hit.
 */
export const itemSearchResultView = (
  result: ItemSearchResult,
  item: ItemView,
): ItemSearchResultView => ({
  item,
  path: result.path.map(storageUnitView),
  location: formatStorageUnitPath(result.path),
  matchedFields: [...result.matchedFields],
});

export const itemAtLocationView = (
  item: ItemView,
  path: readonly StorageUnit[],
): ItemAtLocationView => ({
  item,
  path: path.map(storageUnitView),
  location: formatStorageUnitPath(path),
});

export const storageUnitSearchResultView = (
  result: StorageUnitSearchResult,
): StorageUnitSearchResultView => ({
  unit: storageUnitView(result.unit),
  path: result.path.map(storageUnitView),
  location: formatStorageUnitPath(result.path),
  matchedFields: [...result.matchedFields],
});

/** Only ever the fields a client needs; never the password hash. */
export interface UserView {
  readonly id: string;
  readonly username: string;
}
