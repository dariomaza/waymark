import { coverPhotoId, type Item, type StorageUnit } from "@ariadna/domain";

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
  readonly photos: readonly string[];
  /** `photos[0]`, spelled out so a list screen does not have to know that. */
  readonly coverPhotoId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StorageUnitTreeView extends StorageUnitView {
  readonly children: readonly StorageUnitTreeView[];
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

export const itemView = (item: Item): ItemView => ({
  id: item.id,
  storageUnitId: item.storageUnitId,
  name: item.name,
  description: item.description,
  quantity: item.quantity,
  tags: [...item.tags],
  photos: [...item.photos],
  coverPhotoId: coverPhotoId(item),
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
});

export const storageUnitTreeView = (
  node: StorageUnitTreeNode,
): StorageUnitTreeView => ({
  ...storageUnitView(node.unit),
  children: node.children.map(storageUnitTreeView),
});

/** Only ever the fields a client needs; never the password hash. */
export interface UserView {
  readonly id: string;
  readonly username: string;
}
