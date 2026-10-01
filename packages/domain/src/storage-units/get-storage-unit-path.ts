import { cutPathToReach, mayViewSpace, type Access } from "../access/access.js";
import type { UnitId } from "../shared/identity.js";
import { StorageUnitNotFound } from "./storage-unit-errors.js";
import type { StorageUnit } from "./storage-unit.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

export interface GetStorageUnitPathDependencies {
  readonly storageUnits: StorageUnitRepository;
}

/**
 * The location of a unit is not stored, it is the path to its root (ADR 1).
 *
 * Seen by a person, it is the path to the top of what they may see (ADR 26):
 * it starts at their visible root, and a space they may not see at all does
 * not exist for them.
 */
export class GetStorageUnitPath {
  constructor(private readonly deps: GetStorageUnitPathDependencies) {}

  /** The person's visible root first, the unit itself last. */
  async execute(access: Access, id: UnitId): Promise<StorageUnit[]> {
    const unit = await this.deps.storageUnits.findById(id);
    // The same refusal for both, so an id out of reach cannot be told apart
    // from an id that was never issued.
    if (unit === null || !mayViewSpace(access, id)) {
      throw new StorageUnitNotFound(id);
    }

    const ancestors = await this.deps.storageUnits.findAncestors(id);

    return cutPathToReach(access, [...ancestors.reverse(), unit]);
  }
}

export const STORAGE_UNIT_PATH_SEPARATOR = " > ";

export const formatStorageUnitPath = (path: readonly StorageUnit[]): string =>
  path.map((unit) => unit.name).join(STORAGE_UNIT_PATH_SEPARATOR);
