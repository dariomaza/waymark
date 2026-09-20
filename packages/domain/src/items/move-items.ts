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
 */
export class MoveItems {
  constructor(private readonly deps: MoveItemsDependencies) {}

  async execute(command: MoveItemsCommand): Promise<Item[]> {
    const targetUnit = await this.deps.storageUnits.findById(
      command.targetUnitId,
    );
    if (targetUnit === null) {
      throw new StorageUnitNotFound(command.targetUnitId);
    }

    if (command.itemIds.length === 0) {
      return [];
    }

    const found = await this.deps.items.findManyByIds(command.itemIds);
    const foundIds = new Set(found.map((item) => item.id));
    const missingId = command.itemIds.find((id) => !foundIds.has(id));
    if (missingId !== undefined) {
      throw new ItemNotFound(missingId);
    }

    const now = this.deps.clock.now();
    const moved = found.map((item) =>
      moveItemTo(item, command.targetUnitId, now),
    );
    await this.deps.items.saveAll(moved);

    return moved;
  }
}
