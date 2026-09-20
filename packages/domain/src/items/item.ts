import type { ItemId, PhotoId, UnitId } from "../shared/identity.js";
import { InvalidQuantity } from "./item-errors.js";

/** A thing stored inside exactly one storage unit. */
export interface Item {
  readonly id: ItemId;
  readonly storageUnitId: UnitId;
  readonly name: string;
  readonly description: string | null;
  readonly quantity: number;
  readonly tags: readonly string[];
  /** Ordered; the first photo is the cover. */
  readonly photos: readonly PhotoId[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateItemInput {
  readonly id: ItemId;
  readonly storageUnitId: UnitId;
  readonly name: string;
  readonly description?: string | null;
  readonly quantity?: number;
  readonly tags?: readonly string[];
  readonly photos?: readonly PhotoId[];
  readonly now: Date;
}

const DEFAULT_QUANTITY = 1;

const assertValidQuantity = (quantity: number): void => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new InvalidQuantity(quantity);
  }
};

export const createItem = (input: CreateItemInput): Item => {
  const quantity = input.quantity ?? DEFAULT_QUANTITY;
  assertValidQuantity(quantity);

  return {
    id: input.id,
    storageUnitId: input.storageUnitId,
    name: input.name.trim(),
    description: input.description ?? null,
    quantity,
    tags: [...(input.tags ?? [])],
    photos: [...(input.photos ?? [])],
    createdAt: input.now,
    updatedAt: input.now,
  };
};

/** The cover is the first photo, or nothing when the item has no photo. */
export const coverPhotoId = (item: Item): PhotoId | null =>
  item.photos[0] ?? null;

/**
 * Returns a copy of the item inside the target unit. Whether the target unit
 * exists is decided by the use cases, not here.
 */
export const moveItemTo = (item: Item, storageUnitId: UnitId, now: Date): Item => ({
  ...item,
  storageUnitId,
  updatedAt: now,
});
