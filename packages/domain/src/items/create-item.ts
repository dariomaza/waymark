import { mayViewSpace, type Access } from "../access/access.js";
import { refuseViewOnly } from "../access/write-checks.js";
import type { Clock } from "../shared/clock.js";
import type { IdGenerator } from "../shared/id-generator.js";
import { itemId, type PhotoId, type UnitId } from "../shared/identity.js";
import { StorageUnitNotFound } from "../storage-units/storage-unit-errors.js";
import type { StorageUnitRepository } from "../storage-units/storage-unit-repository.js";
import { createItem, type Item } from "./item.js";
import type { ItemRepository } from "./item-repository.js";

export interface CreateItemDependencies {
  readonly items: ItemRepository;
  readonly storageUnits: StorageUnitRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface CreateItemCommand {
  readonly storageUnitId: UnitId;
  readonly name: string;
  readonly description?: string | null;
  readonly quantity?: number;
  readonly tags?: readonly string[];
  readonly photos?: readonly PhotoId[];
}

/**
 * Puts a new item in a space, which needs edit on that space (ADR 26). A space
 * out of reach is refused exactly as a missing one.
 */
export class CreateItem {
  constructor(private readonly deps: CreateItemDependencies) {}

  async execute(access: Access, command: CreateItemCommand): Promise<Item> {
    const storageUnit = await this.deps.storageUnits.findById(
      command.storageUnitId,
    );
    if (storageUnit === null || !mayViewSpace(access, storageUnit.id)) {
      throw new StorageUnitNotFound(command.storageUnitId);
    }
    refuseViewOnly(access, storageUnit.id);

    const item = createItem({
      id: itemId(this.deps.ids.next()),
      storageUnitId: command.storageUnitId,
      name: command.name,
      description: command.description ?? null,
      ...(command.quantity === undefined ? {} : { quantity: command.quantity }),
      tags: command.tags ?? [],
      photos: command.photos ?? [],
      now: this.deps.clock.now(),
    });

    await this.deps.items.save(item);

    return item;
  }
}
