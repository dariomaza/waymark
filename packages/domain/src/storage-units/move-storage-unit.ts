import { mayViewSpace, type Access } from "../access/access.js";
import { isAtTopFor, refuseViewOnly } from "../access/write-checks.js";
import type { Clock } from "../shared/clock.js";
import type { UnitId, UserId } from "../shared/identity.js";
import { assertStorageUnitMoveIsAcyclic } from "./storage-unit-cycle.js";
import { StorageUnitNotFound } from "./storage-unit-errors.js";
import { ownerOfTreeHolding, refuseUnlessOwner } from "./storage-unit-owner.js";
import { reparentStorageUnit, type StorageUnit } from "./storage-unit.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

export interface MoveStorageUnitDependencies {
  readonly storageUnits: StorageUnitRepository;
  readonly clock: Clock;
}

export interface MoveStorageUnitCommand {
  /** The person moving it, for whether they own the tree it is in (ADR 26). */
  readonly callerId: UserId;
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
 *
 * A move needs edit on both the place the unit leaves and the place it
 * reaches. The top of the tree is a place only the tree's owner, or an
 * administrator, may edit: so only they make a root, and only they move a
 * space that is at the top of what they see. For somebody a space was shared
 * with, that space is at the top, and what is above it is never named.
 */
export class MoveStorageUnit {
  constructor(private readonly deps: MoveStorageUnitDependencies) {}

  async execute(
    access: Access,
    command: MoveStorageUnitCommand,
  ): Promise<StorageUnit> {
    const { storageUnits } = this.deps;
    const unit = await storageUnits.findById(command.id);
    if (unit === null || !mayViewSpace(access, unit.id)) {
      throw new StorageUnitNotFound(command.id);
    }
    const targetId = command.targetParentId;
    if (
      targetId !== null &&
      ((await storageUnits.findById(targetId)) === null || !mayViewSpace(access, targetId))
    ) {
      throw new StorageUnitNotFound(targetId);
    }

    refuseViewOnly(access, unit.id);
    // The place it leaves.
    if (isAtTopFor(access, unit)) {
      await refuseUnlessOwner(access, command.callerId, storageUnits, unit);
    } else {
      refuseViewOnly(access, unit.parentId as UnitId);
    }
    // The place it reaches.
    if (targetId === null) {
      await refuseUnlessOwner(access, command.callerId, storageUnits, unit);
    } else {
      refuseViewOnly(access, targetId);
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
