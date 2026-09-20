import type {
  ItemRepository,
  PhotoRepository,
  SearchRepository,
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

/**
 * A photo stands alone: it is its own aggregate with its own lifecycle (ADR 4)
 * and carries no foreign key to the item or unit that references it, so the
 * contract needs nothing else seeded.
 */
export interface PhotoRepositoryContext {
  readonly photos: PhotoRepository;
}

/**
 * Search reads what the other two ports wrote, so a run needs all three: the
 * suite seeds through the real repositories precisely because an adapter that
 * keeps an index beside the tables has to be told about a write by the write
 * itself, and a contract that wrote straight into the index would be testing
 * the wrong half of it.
 */
export interface SearchRepositoryContext {
  readonly search: SearchRepository;
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
