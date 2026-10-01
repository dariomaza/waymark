import type { Clock } from "../shared/clock.js";
import type { UnitId } from "../shared/identity.js";
import { assertStorageUnitMoveIsAcyclic } from "./storage-unit-cycle.js";
import { StorageUnitNotFound } from "./storage-unit-errors.js";
import { ownerOfTreeHolding } from "./storage-unit-owner.js";
import { reparentStorageUnit, type StorageUnit } from "./storage-unit.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

export interface MoveStorageUnitDependencies {
  readonly storageUnits: StorageUnitRepository;
  readonly clock: Clock;
}

export interface MoveStorageUnitCommand {
  readonly id: UnitId;
  readonly targetParentId: UnitId | null;
}

/**
 * Moves a unit, and implicitly its whole subtree, under a new parent. The move
 * is rejected when it would create a cycle; see `assertStorageUnitMoveIsAcyclic`
 * for why the direct-parent check is not enough (ADR 2).
 *
 * Ownership follows the tree (ADR 26): a unit put inside another space belongs
 * to that space's owner, and a unit taken to the top keeps the owner of the
 * tree it came from — so making a root is never a way to take what was shared.
 */
export class MoveStorageUnit {
  constructor(private readonly deps: MoveStorageUnitDependencies) {}

  async execute(command: MoveStorageUnitCommand): Promise<StorageUnit> {
    const unit = await this.deps.storageUnits.findById(command.id);
    if (unit === null) {
      throw new StorageUnitNotFound(command.id);
    }

    await assertStorageUnitMoveIsAcyclic(
      this.deps.storageUnits,
      unit.id,
      command.targetParentId,
    );

    const moved = reparentStorageUnit(
      unit,
      command.targetParentId === null
        ? {
            parentId: null,
            ownerId: await ownerOfTreeHolding(this.deps.storageUnits, unit),
          }
        : { parentId: command.targetParentId },
      this.deps.clock.now(),
    );
    await this.deps.storageUnits.save(moved);

    return moved;
  }
}
