import type { Item } from "../items/item.js";
import { moveItemTo } from "../items/item.js";
import type { ItemRepository } from "../items/item-repository.js";
import { mayViewSpace, type Access } from "../access/access.js";
import { isAtTopFor, refuseViewOnly } from "../access/write-checks.js";
import type { Clock } from "../shared/clock.js";
import type { UnitId, UserId } from "../shared/identity.js";
import { assertStorageUnitMoveIsAcyclic } from "./storage-unit-cycle.js";
import {
  MissingEmptyTarget,
  StorageUnitNotFound,
} from "./storage-unit-errors.js";
import { ownerOfTreeHolding, refuseUnlessOwner } from "./storage-unit-owner.js";
import {
  reparentStorageUnit,
  type StorageUnit,
  type StorageUnitPlacement,
} from "./storage-unit.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

export interface EmptyStorageUnitDependencies {
  readonly storageUnits: StorageUnitRepository;
  readonly items: ItemRepository;
  readonly clock: Clock;
}

export interface EmptyStorageUnitCommand {
  /** The person emptying it, for whether they own the tree it is in (ADR 26). */
  readonly callerId: UserId;
  readonly id: UnitId;
  /** Where everything goes. The unit's parent when absent. */
  readonly targetUnitId?: UnitId;
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
 *
 * Emptying is a move of everything inside (ADR 26): it needs edit on the unit
 * and on where its contents go. A unit at the top of what the person sees has,
 * for them, nowhere to empty into without a target, exactly as a root has:
 * its spaces would become roots, which only the tree's owner may make, and its
 * items would need a target. That holds whether the unit is a real root or a
 * space shared from inside somebody else's tree, whose parent is never named.
 */
export class EmptyStorageUnit {
  constructor(private readonly deps: EmptyStorageUnitDependencies) {}

  async execute(
    access: Access,
    command: EmptyStorageUnitCommand,
  ): Promise<EmptyStorageUnitResult> {
    const { id, targetUnitId } = command;
    const unit = await this.deps.storageUnits.findById(id);
    if (unit === null || !mayViewSpace(access, unit.id)) {
      throw new StorageUnitNotFound(id);
    }
    if (
      targetUnitId !== undefined &&
      ((await this.deps.storageUnits.findById(targetUnitId)) === null ||
        !mayViewSpace(access, targetUnitId))
    ) {
      throw new StorageUnitNotFound(targetUnitId);
    }
    refuseViewOnly(access, unit.id);

    const [heldItems, childUnits] = await Promise.all([
      this.deps.items.findByStorageUnit(id),
      this.deps.storageUnits.findChildren(id),
    ]);

    const toTheTop = targetUnitId === undefined && isAtTopFor(access, unit);
    if (toTheTop) {
      if (childUnits.length > 0) {
        await refuseUnlessOwner(access, command.callerId, this.deps.storageUnits, unit);
      }
      if (heldItems.length > 0) {
        throw new MissingEmptyTarget(id, heldItems.length);
      }
    }

    const destination = targetUnitId ?? unit.parentId;
    if (destination !== null && !toTheTop) {
      refuseViewOnly(access, destination);
    }
    await assertStorageUnitMoveIsAcyclic(
      this.deps.storageUnits,
      unit.id,
      destination,
    );

    // Children emptied out of a root become roots of their own, and stay the
    // property of whoever owned the tree they were in (ADR 26).
    const placement: StorageUnitPlacement =
      destination === null
        ? {
            parentId: null,
            ownerId: await ownerOfTreeHolding(this.deps.storageUnits, unit),
          }
        : { parentId: destination };

    const now = this.deps.clock.now();
    const movedChildUnits = childUnits.map((child) =>
      reparentStorageUnit(child, placement, now),
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
