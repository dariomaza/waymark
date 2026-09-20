import type {
  ItemRepository,
  StorageUnitRepository,
  UnitId,
} from "@ariadna/domain";

/**
 * Everything a `StorageUnitRepository` contract run needs.
 *
 * `forceParentLink` exists because corrupt data is the one thing a contract
 * cannot create through the port itself: writing a cycle is by definition an
 * operation the domain forbids. HOW corruption is produced is implementation
 * specific (a Map write, an `UPDATE` bypassing the use cases); WHAT the
 * repository must then do about it is not, and that part stays in the contract.
 */
export interface StorageUnitRepositoryContext {
  readonly storageUnits: StorageUnitRepository;
  forceParentLink(id: UnitId, parentId: UnitId): Promise<void>;
}

/**
 * An item never exists on its own: it lives inside exactly one storage unit.
 * The contract therefore needs to seed units as well, which also keeps a
 * relational adapter's foreign keys satisfiable.
 */
export interface ItemRepositoryContext {
  readonly items: ItemRepository;
  readonly storageUnits: StorageUnitRepository;
}

/** Both ports at once, so the domain use cases can be wired to them. */
export interface DomainUseCaseContext {
  readonly storageUnits: StorageUnitRepository;
  readonly items: ItemRepository;
}

/**
 * How one implementation plugs itself into a contract suite.
 *
 * `setUp` must hand back EMPTY storage every time; a contract that leaks state
 * between cases proves nothing. `tearDown` releases whatever `setUp` claimed.
 */
export interface RepositoryHarness<TContext> {
  /** Shown in the test names, so a failure says which implementation broke. */
  readonly name: string;
  setUp(): Promise<TContext>;
  tearDown(): Promise<void>;
}
