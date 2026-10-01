import { mayViewSpace, type Access } from "../access/access.js";
import { refuseViewOnly } from "../access/write-checks.js";
import type { Clock } from "../shared/clock.js";
import type { IdGenerator, PublicIdGenerator } from "../shared/id-generator.js";
import {
  unitId,
  type PhotoId,
  type UnitId,
  type UserId,
} from "../shared/identity.js";
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
  /**
   * The person creating it. A root they create is theirs; a space created
   * inside another belongs to that space's owner, whoever creates it (ADR 26).
   */
  readonly callerId: UserId;
  readonly parentId?: UnitId | null;
  readonly name: string;
  readonly kind: StorageUnitKind;
  readonly description?: string | null;
  readonly photoId?: PhotoId | null;
}

/**
 * Makes a space. Anyone may make a root, and it is theirs; making one inside
 * another space needs edit on that space (ADR 26). A parent out of reach is
 * refused exactly as a missing one.
 */
export class CreateStorageUnit {
  constructor(private readonly deps: CreateStorageUnitDependencies) {}

  async execute(
    access: Access,
    command: CreateStorageUnitCommand,
  ): Promise<StorageUnit> {
    const parentId = command.parentId ?? null;

    if (parentId !== null) {
      const parent = await this.deps.storageUnits.findById(parentId);
      if (parent === null || !mayViewSpace(access, parentId)) {
        throw new StorageUnitNotFound(parentId);
      }
      refuseViewOnly(access, parentId);
    }

    const unit = createStorageUnit({
      id: unitId(this.deps.ids.next()),
      parentId,
      ownerId: parentId === null ? command.callerId : null,
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
