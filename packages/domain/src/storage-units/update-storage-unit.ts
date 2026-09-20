import type { Clock } from "../shared/clock.js";
import type { UnitId } from "../shared/identity.js";
import { StorageUnitNotFound } from "./storage-unit-errors.js";
import {
  reviseStorageUnit,
  type StorageUnit,
  type StorageUnitRevision,
} from "./storage-unit.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

export interface UpdateStorageUnitDependencies {
  readonly storageUnits: StorageUnitRepository;
  readonly clock: Clock;
}

export interface UpdateStorageUnitCommand extends StorageUnitRevision {
  readonly id: UnitId;
}

/**
 * Changes what a unit says about itself: its name, its kind, its description.
 *
 * The first requirement written down for this product was that a storage
 * unit's information be consultable at any time AND editable. A typo in a box
 * name is otherwise permanent, and the label glued to that box carries a
 * `publicId` that a delete-and-recreate would throw away — so "just make a new
 * one" is not an answer, it is a trip to the garage with a printer.
 *
 * It deliberately cannot move the unit. `MoveStorageUnit` walks the ancestor
 * chain and refuses a cycle (ADR 2); this one takes no `parentId` at all, so
 * there is no path through here that reaches the tree's shape.
 */
export class UpdateStorageUnit {
  constructor(private readonly deps: UpdateStorageUnitDependencies) {}

  async execute(command: UpdateStorageUnitCommand): Promise<StorageUnit> {
    const unit = await this.deps.storageUnits.findById(command.id);
    if (unit === null) {
      throw new StorageUnitNotFound(command.id);
    }

    const revised = reviseStorageUnit(unit, command, this.deps.clock.now());
    await this.deps.storageUnits.save(revised);

    return revised;
  }
}
