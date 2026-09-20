import { itemId, photoId, unitId, type Item } from "@ariadna/domain";
import type {
  Item as ItemRow,
  ItemPhoto as ItemPhotoRow,
  ItemTag as ItemTagRow,
} from "@prisma/client";

/**
 * An item is only complete with its ordered tags and photos, so every read
 * pulls them in the same shape. `position` ascending IS the domain's array
 * order, and photo 0 is the cover.
 */
export const ITEM_RELATIONS = {
  tags: { orderBy: { position: "asc" } },
  photos: { orderBy: { position: "asc" } },
} as const;

export type ItemRowWithRelations = ItemRow & {
  readonly tags: readonly ItemTagRow[];
  readonly photos: readonly ItemPhotoRow[];
};

export const toDomainItem = (row: ItemRowWithRelations): Item => ({
  id: itemId(row.id),
  storageUnitId: unitId(row.storageUnitId),
  name: row.name,
  description: row.description,
  quantity: row.quantity,
  tags: row.tags.map((tag) => tag.tag),
  photos: row.photos.map((photo) => photoId(photo.photoId)),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toItemRow = (item: Item): ItemRow => ({
  id: item.id,
  storageUnitId: item.storageUnitId,
  name: item.name,
  description: item.description,
  quantity: item.quantity,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

/** The array index is the stored position: the ordering is not a convention. */
export const toItemTagRows = (item: Item): ItemTagRow[] =>
  item.tags.map((tag, position) => ({ itemId: item.id, position, tag }));

export const toItemPhotoRows = (item: Item): ItemPhotoRow[] =>
  item.photos.map((photo, position) => ({
    itemId: item.id,
    position,
    photoId: photo,
  }));
