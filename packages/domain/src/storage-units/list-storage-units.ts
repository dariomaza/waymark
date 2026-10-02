import { mayViewSpace, type Access } from "../access/access.js";
import type { StorageUnit } from "./storage-unit.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

export interface ListStorageUnitsDependencies {
  readonly storageUnits: StorageUnitRepository;
}

/**
 * Every space a person may see, at every depth, in no guaranteed order: the
 * material the home screen's tree is shaped from (ADR 1).
 *
 * A space whose parent is not in the answer is one of the person's visible
 * roots (ADR 26), so a space shared from inside somebody else's tree arrives
 * at the top, with everything under it and nothing above it.
 */
export class ListStorageUnits {
  constructor(private readonly deps: ListStorageUnitsDependencies) {}

  async execute(access: Access): Promise<StorageUnit[]> {
    const units = await this.deps.storageUnits.findAll();

    return units.filter((unit) => mayViewSpace(access, unit.id));
  }
}
