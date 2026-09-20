import type { Item } from "../items/item.js";
import type { UnitId } from "../shared/identity.js";
import { GetStorageUnitPath } from "../storage-units/get-storage-unit-path.js";
import { StorageUnitNotFound } from "../storage-units/storage-unit-errors.js";
import type { StorageUnitRepository } from "../storage-units/storage-unit-repository.js";
import type { StorageUnit } from "../storage-units/storage-unit.js";
import {
  compareSearchMatches,
  matchItem,
  matchStorageUnit,
  type SearchMatch,
  type SearchMatchField,
} from "./search-match.js";
import type { SearchRepository } from "./search-repository.js";
import { toSearchTerms } from "./search-text.js";

export interface SearchInventoryDependencies {
  readonly search: SearchRepository;
  readonly storageUnits: StorageUnitRepository;
}

export interface SearchInventoryCommand {
  /** Whatever the person typed. Folded into terms here, not by the caller. */
  readonly query: string;
  /**
   * Restricts the answer to the subtree under this unit, at any depth (ADR 1).
   * Items held directly by it count as inside it; the unit itself is not a
   * result, because a thing is not inside itself.
   */
  readonly withinUnitId?: UnitId | null;
  readonly limit?: number;
}

interface SearchResult {
  /** Root first, ending at the unit that answers "where is it". */
  readonly path: readonly StorageUnit[];
  readonly matchedFields: readonly SearchMatchField[];
  readonly relevance: number;
}

export interface ItemSearchResult extends SearchResult {
  readonly item: Item;
}

export interface StorageUnitSearchResult extends SearchResult {
  readonly unit: StorageUnit;
}

export interface SearchInventoryResult {
  /** What the query was actually folded into; empty when it said nothing. */
  readonly terms: readonly string[];
  readonly items: readonly ItemSearchResult[];
  readonly storageUnits: readonly StorageUnitSearchResult[];
}

/**
 * How many results one query answers with unless the caller says otherwise.
 *
 * Twenty is a screen and a bit on a phone. The question this feature answers
 * is "where is my drill", and a hundredth-best guess at that is noise.
 */
export const DEFAULT_SEARCH_LIMIT = 20;

/**
 * # Where is my thing
 *
 * The one question the product exists to answer, so the answer is shaped like
 * the question: not "these items exist" but "this item is in the third box of
 * the metal wardrobe in the garage". Every result therefore carries its whole
 * breadcrumb. A hit with no path tells somebody a thing they already knew.
 *
 * The repository finds candidates; everything that decides what comes back and
 * in what order happens here, because all of it is product judgement:
 *
 * - **A name beats a tag beats a description** (`compareSearchMatches`).
 * - **A subtree is the scope**, at any depth, because a location IS a storage
 *   unit (ADR 1) and "in the garage" means everything under it.
 * - **The limit is applied last**, after scoping and ordering. Cutting earlier
 *   would answer quickly with the wrong twenty.
 */
export class SearchInventory {
  readonly #paths: GetStorageUnitPath;

  constructor(private readonly deps: SearchInventoryDependencies) {
    this.#paths = new GetStorageUnitPath({ storageUnits: deps.storageUnits });
  }

  async execute(
    command: SearchInventoryCommand,
  ): Promise<SearchInventoryResult> {
    const terms = toSearchTerms(command.query);
    if (terms.length === 0) {
      // Nothing was asked, so nothing is answered. Treating an empty query as
      // "everything" would turn a keystroke into a full inventory dump.
      return { terms, items: [], storageUnits: [] };
    }

    const scope = await this.#scopeOf(command.withinUnitId ?? null);
    const limit = command.limit ?? DEFAULT_SEARCH_LIMIT;

    const [candidateItems, candidateUnits] = await Promise.all([
      this.deps.search.findItemsMatching(terms),
      this.deps.search.findStorageUnitsMatching(terms),
    ]);

    const items = rank(
      candidateItems.filter(
        (item) => scope === null || scope.holds(item.storageUnitId),
      ),
      (item) => matchItem(item, terms),
      (item) => item.name,
      limit,
    );

    const storageUnits = rank(
      candidateUnits.filter((unit) => scope === null || scope.contains(unit.id)),
      (unit) => matchStorageUnit(unit, terms),
      (unit) => unit.name,
      limit,
    );

    return {
      terms,
      items: await Promise.all(
        items.map(async ({ entity, match }) => ({
          item: entity,
          path: await this.#pathTo(entity.storageUnitId),
          matchedFields: match.matchedFields,
          relevance: match.relevance,
        })),
      ),
      storageUnits: await Promise.all(
        storageUnits.map(async ({ entity, match }) => ({
          unit: entity,
          path: await this.#pathTo(entity.id),
          matchedFields: match.matchedFields,
          relevance: match.relevance,
        })),
      ),
    };
  }

  /**
   * Paths are memoized for the length of one search: a box holding six
   * matching items is one walk, not six. Beyond that the walk is the same one
   * `GET /storage-units/:id` already uses, rather than a second implementation
   * of "climb to the root" that could disagree with it about a corrupt tree.
   */
  readonly #cachedPaths = new Map<string, Promise<StorageUnit[]>>();

  async #pathTo(id: UnitId): Promise<StorageUnit[]> {
    const cached = this.#cachedPaths.get(id);
    if (cached !== undefined) {
      return cached;
    }

    const path = this.#paths.execute(id);
    this.#cachedPaths.set(id, path);

    return path;
  }

  async #scopeOf(withinUnitId: UnitId | null): Promise<SearchScope | null> {
    if (withinUnitId === null) {
      return null;
    }

    const root = await this.deps.storageUnits.findById(withinUnitId);
    if (root === null) {
      throw new StorageUnitNotFound(withinUnitId);
    }

    // One read of the forest, walked downwards. Asking for children level by
    // level would be one round trip per level of a tree ADR 1 already says is
    // small enough to shape in memory, and the visited set makes the walk
    // terminate even on a tree a bad restore turned into a cycle.
    const units = await this.deps.storageUnits.findAll();
    const childrenOf = new Map<string, StorageUnit[]>();
    for (const unit of units) {
      if (unit.parentId === null) {
        continue;
      }
      const siblings = childrenOf.get(unit.parentId);
      if (siblings === undefined) {
        childrenOf.set(unit.parentId, [unit]);
      } else {
        siblings.push(unit);
      }
    }

    const descendants = new Set<string>();
    const queue: StorageUnit[] = [root];
    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) {
        continue;
      }
      for (const child of childrenOf.get(current.id) ?? []) {
        if (descendants.has(child.id)) {
          continue;
        }
        descendants.add(child.id);
        queue.push(child);
      }
    }

    return {
      // An item in the garage is in the garage; a box is not inside itself.
      holds: (id) => id === root.id || descendants.has(id),
      contains: (id) => descendants.has(id),
    };
  }
}

interface SearchScope {
  /** Whether a unit may hold a matching item. Includes the scope itself. */
  holds(id: UnitId): boolean;
  /** Whether a unit is itself inside the scope. Excludes the scope itself. */
  contains(id: UnitId): boolean;
}

interface Ranked<T> {
  readonly entity: T;
  readonly match: SearchMatch;
}

/**
 * A total order: the match first, then the name, then the id. Without the last
 * two, two reads of an unchanged inventory could list equally good results in
 * a different sequence and the screen would look like it was shuffling itself.
 */
const rank = <T extends { readonly id: string }>(
  candidates: readonly T[],
  matchOf: (entity: T) => SearchMatch | null,
  nameOf: (entity: T) => string,
  limit: number,
): Ranked<T>[] =>
  candidates
    .flatMap((entity) => {
      const match = matchOf(entity);
      // The index said this one matches and the entity says it does not, so
      // the index is behind. Showing it would be answering a question nobody
      // asked; the fix belongs in whatever keeps the index honest.
      return match === null ? [] : [{ entity, match }];
    })
    .sort(
      (left, right) =>
        compareSearchMatches(left.match, right.match) ||
        nameOf(left.entity).localeCompare(nameOf(right.entity), "en") ||
        left.entity.id.localeCompare(right.entity.id),
    )
    .slice(0, Math.max(0, limit));
