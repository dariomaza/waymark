import { mayViewSpace, type Access } from "../access/access.js";
import { refuseViewOnly } from "../access/write-checks.js";
import type { Clock } from "../shared/clock.js";
import type { ItemId, UnitId } from "../shared/identity.js";
import { StorageUnitNotFound } from "../storage-units/storage-unit-errors.js";
import type { StorageUnitRepository } from "../storage-units/storage-unit-repository.js";
import { ItemNotFound } from "./item-errors.js";
import { moveItemTo, type Item } from "./item.js";
import type { ItemRepository } from "./item-repository.js";

export interface MoveItemsDependencies {
  readonly items: ItemRepository;
  readonly storageUnits: StorageUnitRepository;
  readonly clock: Clock;
}

export interface MoveItemsCommand {
  readonly itemIds: readonly ItemId[];
  readonly targetUnitId: UnitId;
}

/**
 * Bulk move, so emptying a unit is not a one-by-one chore (ADR 3). It is all
 * or nothing: one unknown item rejects the whole batch.
 *
 * Every item needs edit on the space it leaves, and the target needs edit
 * (ADR 26). Every check is made before anything is written, so a batch with
 * one item that may not move moves nothing. The order is fixed, so the answer
 * is too: first whether the target and then each item, in the order given,
 * can be seen at all, and only then whether the target and each item may be
 * changed. An item out of reach is therefore reported before a view-only one,
 * wherever it stands in the list, and nothing reveals that it exists.
 */
export class MoveItems {
  constructor(private readonly deps: MoveItemsDependencies) {}

  async execute(access: Access, command: MoveItemsCommand): Promise<Item[]> {
    const targetUnit = await this.deps.storageUnits.findById(
      command.targetUnitId,
    );
    if (targetUnit === null || !mayViewSpace(access, targetUnit.id)) {
      throw new StorageUnitNotFound(command.targetUnitId);
    }

    const found =
      command.itemIds.length === 0
        ? []
        : await this.deps.items.findManyByIds(command.itemIds);
    const seen = new Map(
      found
        .filter((item) => mayViewSpace(access, item.storageUnitId))
        .map((item) => [item.id, item]),
    );
    const unseenId = command.itemIds.find((id) => !seen.has(id));
    if (unseenId !== undefined) {
      throw new ItemNotFound(unseenId);
    }

    refuseViewOnly(access, targetUnit.id);
    for (const id of command.itemIds) {
      refuseViewOnly(access, (seen.get(id) as Item).storageUnitId);
    }

    const now = this.deps.clock.now();
    const moved = found.map((item) =>
      moveItemTo(item, command.targetUnitId, now),
    );
    await this.deps.items.saveAll(moved);

    return moved;
  }
}
