import { DomainError } from "../shared/domain-error.js";
import type { ItemId } from "../shared/identity.js";

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
