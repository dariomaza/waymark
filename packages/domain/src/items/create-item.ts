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

export class CreateItem {
  constructor(private readonly deps: CreateItemDependencies) {}

  async execute(command: CreateItemCommand): Promise<Item> {
    const storageUnit = await this.deps.storageUnits.findById(
      command.storageUnitId,
    );
    if (storageUnit === null) {
      throw new StorageUnitNotFound(command.storageUnitId);
    }

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
