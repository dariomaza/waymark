import { mayViewSpace, type Access } from "../access/access.js";
import { refuseViewOnly } from "../access/write-checks.js";
import type { ItemRepository } from "../items/item-repository.js";
import type { UnitId } from "../shared/identity.js";
import {
  StorageUnitNotEmpty,
  StorageUnitNotFound,
} from "./storage-unit-errors.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

export interface DeleteStorageUnitDependencies {
  readonly storageUnits: StorageUnitRepository;
  readonly items: ItemRepository;
}

/**
 * You do not throw away a full box; you empty it first (ADR 3). A unit is
 * empty only when it holds no item AND no child unit, and nothing in the
 * domain ever cascades.
 *
 * Deleting needs edit on the space, and is refused for that before emptiness
 * is even counted (ADR 26): "not empty" about a space somebody may not see
 * would tell them it exists.
 */
export class DeleteStorageUnit {
  constructor(private readonly deps: DeleteStorageUnitDependencies) {}

  async execute(access: Access, id: UnitId): Promise<void> {
    const unit = await this.deps.storageUnits.findById(id);
    if (unit === null || !mayViewSpace(access, unit.id)) {
      throw new StorageUnitNotFound(id);
    }
    refuseViewOnly(access, unit.id);

    const [itemCount, childUnitCount] = await Promise.all([
      this.deps.items.countByStorageUnit(id),
      this.deps.storageUnits.countChildren(id),
    ]);

    if (itemCount > 0 || childUnitCount > 0) {
      throw new StorageUnitNotEmpty(id, itemCount, childUnitCount);
    }

    await this.deps.storageUnits.delete(id);
  }
}
