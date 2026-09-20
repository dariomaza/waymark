import type { UnitId } from "../shared/identity.js";
import { StorageUnitNotFound } from "./storage-unit-errors.js";
import type { StorageUnit } from "./storage-unit.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

export interface GetStorageUnitPathDependencies {
  readonly storageUnits: StorageUnitRepository;
}

/**
 * The location of a unit is not stored, it is the path to its root (ADR 1).
 */
export class GetStorageUnitPath {
  constructor(private readonly deps: GetStorageUnitPathDependencies) {}

  /** Root first, the unit itself last. */
  async execute(id: UnitId): Promise<StorageUnit[]> {
    const unit = await this.deps.storageUnits.findById(id);
    if (unit === null) {
      throw new StorageUnitNotFound(id);
    }

    const ancestors = await this.deps.storageUnits.findAncestors(id);

    return [...ancestors.reverse(), unit];
  }
}

export const STORAGE_UNIT_PATH_SEPARATOR = " > ";

export const formatStorageUnitPath = (path: readonly StorageUnit[]): string =>
  path.map((unit) => unit.name).join(STORAGE_UNIT_PATH_SEPARATOR);
