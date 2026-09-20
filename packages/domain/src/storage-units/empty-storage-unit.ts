import type { Item } from "../items/item.js";
import { moveItemTo } from "../items/item.js";
import type { ItemRepository } from "../items/item-repository.js";
import type { Clock } from "../shared/clock.js";
import type { UnitId } from "../shared/identity.js";
import { assertStorageUnitMoveIsAcyclic } from "./storage-unit-cycle.js";
import {
  MissingEmptyTarget,
  StorageUnitNotFound,
} from "./storage-unit-errors.js";
import { reparentStorageUnit, type StorageUnit } from "./storage-unit.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

export interface EmptyStorageUnitDependencies {
  readonly storageUnits: StorageUnitRepository;
  readonly items: ItemRepository;
  readonly clock: Clock;
}

export interface EmptyStorageUnitResult {
  readonly movedItems: readonly Item[];
  readonly movedChildUnits: readonly StorageUnit[];
}

/**
 * Turns "empty then delete" into two clicks (ADR 3): relocates every item and
 * every child unit, by default to the parent, otherwise to an explicit target.
 *
 * The target is validated as if the unit being emptied were moved there, so it
 * can be neither the unit itself nor any of its descendants (ADR 2). Both would
 * leave the contents inside the unit and make the whole operation pointless or
 * cyclic.
 */
export class EmptyStorageUnit {
  constructor(private readonly deps: EmptyStorageUnitDependencies) {}

  async execute(
    id: UnitId,
    targetUnitId?: UnitId,
  ): Promise<EmptyStorageUnitResult> {
    const unit = await this.deps.storageUnits.findById(id);
    if (unit === null) {
      throw new StorageUnitNotFound(id);
    }

    const destination = targetUnitId ?? unit.parentId;
    await assertStorageUnitMoveIsAcyclic(
      this.deps.storageUnits,
      unit.id,
      destination,
    );

    const [heldItems, childUnits] = await Promise.all([
      this.deps.items.findByStorageUnit(id),
      this.deps.storageUnits.findChildren(id),
    ]);

    if (destination === null && heldItems.length > 0) {
      throw new MissingEmptyTarget(id, heldItems.length);
    }

    const now = this.deps.clock.now();
    const movedChildUnits = childUnits.map((child) =>
      reparentStorageUnit(child, destination, now),
    );
    const movedItems =
      destination === null
        ? []
        : heldItems.map((item) => moveItemTo(item, destination, now));

    await Promise.all([
      this.deps.storageUnits.saveAll(movedChildUnits),
      this.deps.items.saveAll(movedItems),
    ]);

    return { movedItems, movedChildUnits };
  }
}
