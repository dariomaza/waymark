import type { Clock } from "../shared/clock.js";
import type { ItemId } from "../shared/identity.js";
import { ItemNotFound } from "./item-errors.js";
import { reviseItem, type Item, type ItemRevision } from "./item.js";
import type { ItemRepository } from "./item-repository.js";

export interface UpdateItemDependencies {
  readonly items: ItemRepository;
  readonly clock: Clock;
}

export interface UpdateItemCommand extends ItemRevision {
  readonly id: ItemId;
}

/**
 * Changes what an item says about itself: its name, its description, how many
 * there are, and its tags.
 *
 * Retagging matters more than it looks. A tag is the whole reason searching
 * `cables` finds an item called `HDMI 2.1` (ADR 11), and without an edit the
 * only way to fix a mistyped tag was to delete the item — which also deletes
 * its photos. The search index is kept by triggers inside the same
 * transaction as the write (ADR 11), so a rename or a retag cannot leave it
 * behind, whatever the caller remembers to do.
 *
 * It deliberately cannot move the item: `MoveItems` owns that, all or nothing
 * across a batch, after checking the target unit exists (ADR 3).
 */
export class UpdateItem {
  constructor(private readonly deps: UpdateItemDependencies) {}

  async execute(command: UpdateItemCommand): Promise<Item> {
    const item = await this.deps.items.findById(command.id);
    if (item === null) {
      throw new ItemNotFound(command.id);
    }

    // `reviseItem` may refuse the quantity, and it refuses BEFORE anything is
    // written, so a rejected edit leaves the stored item exactly as it was.
    const revised = reviseItem(item, command, this.deps.clock.now());
    await this.deps.items.save(revised);

    return revised;
  }
}
