import {
  formatStorageUnitPath,
  type Item,
  type ItemSearchResult,
  type Photo,
  type PhotoId,
  type StorageUnit,
  type StorageUnitSearchResult,
} from "@ariadna/domain";

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
export interface StorageUnitView {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly kind: string;
  readonly description: string | null;
  readonly photoId: string | null;
  readonly publicId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
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

export interface StorageUnitSearchResultView extends SearchResultView {
  readonly unit: StorageUnitView;
}

export const storageUnitView = (unit: StorageUnit): StorageUnitView => ({
  id: unit.id,
  parentId: unit.parentId,
  name: unit.name,
  kind: unit.kind,
  description: unit.description,
  photoId: unit.photoId,
  publicId: unit.publicId,
  createdAt: unit.createdAt.toISOString(),
  updatedAt: unit.updatedAt.toISOString(),
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
