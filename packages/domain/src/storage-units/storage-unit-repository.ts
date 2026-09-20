import type { UnitId } from "../shared/identity.js";
import type { StorageUnit } from "./storage-unit.js";

export interface StorageUnitRepository {
  findById(id: UnitId): Promise<StorageUnit | null>;

  /** Direct children only. */
  findChildren(id: UnitId): Promise<StorageUnit[]>;

  /** Number of direct children, for the emptiness rule (ADR 3). */
  countChildren(id: UnitId): Promise<number>;

  /**
   * The chain from the direct parent up to the root, nearest first. Empty for
   * a root. Cycle detection walks this chain instead of loading a subtree
   * (ADR 2).
   */
  findAncestors(id: UnitId): Promise<StorageUnit[]>;

  save(unit: StorageUnit): Promise<void>;

  saveAll(units: readonly StorageUnit[]): Promise<void>;

  delete(id: UnitId): Promise<void>;
}
