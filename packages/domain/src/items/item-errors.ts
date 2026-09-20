import { DomainError } from "../shared/domain-error.js";
import type { ItemId, PhotoId } from "../shared/identity.js";

export class ItemNotFound extends DomainError {
  constructor(readonly id: ItemId) {
    super(`Item ${id} was not found`);
  }
}

export class InvalidQuantity extends DomainError {
  constructor(readonly quantity: number) {
    super(`Quantity must be an integer of at least 1, received ${quantity}`);
  }
}

/**
 * Raised when an item would end up holding more photos than the cap, or the
 * same photo twice.
 *
 * Both are the same refusal because both are "this item cannot take that photo
 * as well": a duplicate is a second slot spent on an image already there.
 */
export class TooManyItemPhotos extends DomainError {
  constructor(
    readonly id: ItemId,
    readonly limit: number,
    readonly photoCount: number,
  ) {
    super(
      `Item ${id} cannot hold more than ${limit} photo(s); it already holds ${photoCount}`,
    );
  }
}

/**
 * Raised when an operation names a photo the item does not hold — detaching one
 * that is not there, or reordering with a list that is not exactly the item's
 * own photos.
 */
export class PhotoNotOnItem extends DomainError {
  constructor(
    readonly id: ItemId,
    readonly photoId: PhotoId,
  ) {
    super(`Item ${id} does not hold photo ${photoId}`);
  }
}
