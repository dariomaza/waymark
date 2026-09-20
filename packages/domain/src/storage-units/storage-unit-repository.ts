import type { UnitId } from "../shared/identity.js";
import type { StorageUnit } from "./storage-unit.js";

export interface StorageUnitRepository {
  findById(id: UnitId): Promise<StorageUnit | null>;

  /**
   * Every stored unit, at every depth, in no guaranteed order.
   *
   * Rendering the whole tree needs the whole forest, and asking for it once
   * beats one `findChildren` round trip per node. ADR 1 puts a real inventory
   * at a handful of levels and, at homelab scale, thousands of units at most,
   * so "load it all and shape it in memory" is the honest reading of the data
   * rather than a shortcut that will hurt later.
   */
  findAll(): Promise<StorageUnit[]>;

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
