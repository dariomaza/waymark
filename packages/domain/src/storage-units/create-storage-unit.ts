import type { Clock } from "../shared/clock.js";
import type { IdGenerator, PublicIdGenerator } from "../shared/id-generator.js";
import { unitId, type PhotoId, type UnitId } from "../shared/identity.js";
import { StorageUnitNotFound } from "./storage-unit-errors.js";
import { createStorageUnit, type StorageUnit, type StorageUnitKind } from "./storage-unit.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

export interface CreateStorageUnitDependencies {
  readonly storageUnits: StorageUnitRepository;
  readonly ids: IdGenerator;
  readonly publicIds: PublicIdGenerator;
  readonly clock: Clock;
}

export interface CreateStorageUnitCommand {
  readonly parentId?: UnitId | null;
  readonly name: string;
  readonly kind: StorageUnitKind;
  readonly description?: string | null;
  readonly photoId?: PhotoId | null;
}

export class CreateStorageUnit {
  constructor(private readonly deps: CreateStorageUnitDependencies) {}

  async execute(command: CreateStorageUnitCommand): Promise<StorageUnit> {
    const parentId = command.parentId ?? null;

    if (parentId !== null) {
      const parent = await this.deps.storageUnits.findById(parentId);
      if (parent === null) {
        throw new StorageUnitNotFound(parentId);
      }
    }

    const unit = createStorageUnit({
      id: unitId(this.deps.ids.next()),
      parentId,
      name: command.name,
      kind: command.kind,
      description: command.description ?? null,
      photoId: command.photoId ?? null,
      publicId: this.deps.publicIds.next(),
      now: this.deps.clock.now(),
    });

    await this.deps.storageUnits.save(unit);

    return unit;
  }
}
