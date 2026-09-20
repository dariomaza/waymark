import type { ItemId, PhotoId, UnitId } from "../shared/identity.js";
import { InvalidQuantity, PhotoNotOnItem, TooManyItemPhotos } from "./item-errors.js";

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

/**
 * How many photos one item may hold.
 *
 * Ten is already generous for "what is in this box": a couple of angles, the
 * label, the serial number. The cap is not about storage — it is about the
 * upload endpoint. Without one, a single item is an unbounded place to push
 * bytes into an internet-facing service, and `GET /items/:id` eventually
 * answers with a list nobody can render.
 *
 * It lives in the domain, not in the HTTP validation layer, because it is a
 * rule about an item rather than about a request: every path that can add a
 * photo has to obey it, including creating an item with photos already
 * attached.
 */
export const MAX_ITEM_PHOTOS = 10;

const assertValidQuantity = (quantity: number): void => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new InvalidQuantity(quantity);
  }
};

export const createItem = (input: CreateItemInput): Item => {
  const quantity = input.quantity ?? DEFAULT_QUANTITY;
  assertValidQuantity(quantity);

  const photos = [...(input.photos ?? [])];
  if (photos.length > MAX_ITEM_PHOTOS) {
    throw new TooManyItemPhotos(input.id, MAX_ITEM_PHOTOS, photos.length);
  }

  return {
    id: input.id,
    storageUnitId: input.storageUnitId,
    name: input.name.trim(),
    description: input.description ?? null,
    quantity,
    tags: [...(input.tags ?? [])],
    photos,
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

/**
 * What an edit of an item may say. An absent field means "leave it alone";
 * `null` on the description is the only way to take one off, and `tags` is
 * always the COMPLETE list, because a revision that could only add tags would
 * leave no way to remove the one that was a typo.
 *
 * `storageUnitId` is not here. Moving an item is `MoveItems`, which is all or
 * nothing across a batch (ADR 3) and checks the target unit exists; an edit
 * that could quietly relocate a thing is how an inventory starts lying about
 * where things are, which is the one thing this product must not do.
 *
 * `photos` is absent too: the order is the cover (ADR 9), and it is written by
 * the three photo operations that own it.
 */
export interface ItemRevision {
  readonly name?: string;
  readonly description?: string | null;
  readonly quantity?: number;
  readonly tags?: readonly string[];
}

/**
 * Returns a copy of the item with whatever the revision names changed.
 *
 * The quantity is checked by the same assertion `createItem` uses, so an item
 * cannot be edited into a state it could never have been created in.
 */
export const reviseItem = (item: Item, revision: ItemRevision, now: Date): Item => {
  if (revision.quantity !== undefined) {
    assertValidQuantity(revision.quantity);
  }

  return {
    ...item,
    name: revision.name === undefined ? item.name : revision.name.trim(),
    description:
      revision.description === undefined ? item.description : revision.description,
    quantity: revision.quantity ?? item.quantity,
    tags: revision.tags === undefined ? item.tags : [...revision.tags],
    updatedAt: now,
  };
};

/**
 * Appends a photo. Appending, rather than prepending, is what makes the FIRST
 * photo somebody uploads the cover and keeps it there: uploading a detail shot
 * afterwards must not silently replace the picture of the whole box on every
 * list screen. Choosing a different cover is `reorderItemPhotos`, deliberately
 * an explicit act.
 */
export const attachPhotoToItem = (
  item: Item,
  photoId: PhotoId,
  now: Date,
): Item => {
  if (item.photos.length >= MAX_ITEM_PHOTOS || item.photos.includes(photoId)) {
    throw new TooManyItemPhotos(item.id, MAX_ITEM_PHOTOS, item.photos.length);
  }

  return { ...item, photos: [...item.photos, photoId], updatedAt: now };
};

/**
 * Removes a photo and closes the gap, so the next one becomes the cover. The
 * photo itself is not destroyed here: the domain owns no files, and whoever
 * called this is handed the id to release.
 */
export const detachPhotoFromItem = (
  item: Item,
  photoId: PhotoId,
  now: Date,
): Item => {
  if (!item.photos.includes(photoId)) {
    throw new PhotoNotOnItem(item.id, photoId);
  }

  return {
    ...item,
    photos: item.photos.filter((held) => held !== photoId),
    updatedAt: now,
  };
};

/**
 * Replaces the order outright, which is also how a cover is chosen: the cover
 * is `photos[0]` and nothing else.
 *
 * The new order must be a PERMUTATION of the photos the item already holds.
 * Accepting a subset would drop photos whose files are still on disk, and
 * accepting an unknown id would attach a photo through a route that is not the
 * upload. Either would be a leak that looks like a successful request.
 */
export const reorderItemPhotos = (
  item: Item,
  order: readonly PhotoId[],
  now: Date,
): Item => {
  const held = new Set<string>(item.photos);
  const seen = new Set<string>();

  for (const photoId of order) {
    if (!held.has(photoId) || seen.has(photoId)) {
      throw new PhotoNotOnItem(item.id, photoId);
    }
    seen.add(photoId);
  }

  const missing = item.photos.find((photoId) => !seen.has(photoId));
  if (missing !== undefined) {
    throw new PhotoNotOnItem(item.id, missing);
  }

  return { ...item, photos: [...order], updatedAt: now };
};
