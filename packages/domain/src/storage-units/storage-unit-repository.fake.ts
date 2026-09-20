import type { UnitId } from "../shared/identity.js";
import type { StorageUnit } from "./storage-unit.js";
import type { StorageUnitRepository } from "./storage-unit-repository.js";

/**
 * A real, working repository backed by a Map. Tests drive the use cases
 * through this instead of stubbing single calls, so a broken rule shows up as
 * wrong stored state rather than as an unmet expectation.
 */
export class InMemoryStorageUnitRepository implements StorageUnitRepository {
  readonly #units = new Map<string, StorageUnit>();

  constructor(units: readonly StorageUnit[] = []) {
    for (const unit of units) {
      this.#units.set(unit.id, unit);
    }
  }

  get size(): number {
    return this.#units.size;
  }

  async findById(id: UnitId): Promise<StorageUnit | null> {
    return this.#units.get(id) ?? null;
  }

  async findChildren(id: UnitId): Promise<StorageUnit[]> {
    return [...this.#units.values()].filter((unit) => unit.parentId === id);
  }

  async countChildren(id: UnitId): Promise<number> {
    return (await this.findChildren(id)).length;
  }

  async findAncestors(id: UnitId): Promise<StorageUnit[]> {
    const ancestors: StorageUnit[] = [];
    const visited = new Set<string>([id]);

    let parentId = this.#units.get(id)?.parentId ?? null;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        // A stored cycle is a bug the domain is supposed to make impossible.
        // Failing loudly beats hanging the test suite.
        throw new Error(`Stored storage unit cycle detected at ${parentId}`);
      }
      visited.add(parentId);

      const parent = this.#units.get(parentId);
      if (parent === undefined) {
        break;
      }

      ancestors.push(parent);
      parentId = parent.parentId;
    }

    return ancestors;
  }

  async save(unit: StorageUnit): Promise<void> {
    this.#units.set(unit.id, unit);
  }

  async saveAll(units: readonly StorageUnit[]): Promise<void> {
    for (const unit of units) {
      this.#units.set(unit.id, unit);
    }
  }

  async delete(id: UnitId): Promise<void> {
    this.#units.delete(id);
  }
}
