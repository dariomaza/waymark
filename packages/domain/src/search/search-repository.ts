import type { Item } from "../items/item.js";
import type { StorageUnit } from "../storage-units/storage-unit.js";

/**
 * Finding the candidates a query could possibly answer.
 *
 * # Retrieval here, ranking in the domain
 *
 * This port does one job: hand back everything that could match, fast. It is
 * NOT asked to order results, to score them, to scope them to a subtree or to
 * cut them to a limit. All of that is `SearchInventory`'s, computed from the
 * entities themselves with `matchItem` and `matchStorageUnit`.
 *
 * The split is deliberate. An adapter over SQLite FTS5 and the in-memory one
 * the domain is tested with can be made to agree on WHICH rows contain a word;
 * they can never be made to agree on bm25 scores, so a port that promised an
 * order would promise something only one of its implementations could keep.
 * With ranking on this side of the port, the fake and the real adapter produce
 * the same answer in the same order, which is the whole point of having a port
 * (ADR 11).
 *
 * It also means the domain re-checks every candidate against the query. A row
 * an index hands back that no longer contains the word is dropped rather than
 * shown, so a stale index can never invent a result — only miss one, which is
 * what the index's own consistency rules are for.
 *
 * # Terms
 *
 * `terms` are already folded by `toSearchTerms`: lower case, no accents, no
 * repeats, split into words. An implementation matches a term against the
 * START of a word, so `cab` finds `cables`, and requires EVERY term to appear
 * somewhere in the entity.
 *
 * An empty `terms` matches nothing at all, never everything.
 *
 * # Size
 *
 * There is no limit parameter, on purpose. Cutting the candidate list before
 * it is scoped to a subtree would silently drop the results that were inside
 * the garage, and "the answer is wrong but it came back quickly" is the one
 * outcome this feature cannot afford. At the scale ADR 1 describes, the rows
 * that share a word with a query are few.
 */
export interface SearchRepository {
  /** Every item whose name, tags or description contain every term. */
  findItemsMatching(terms: readonly string[]): Promise<Item[]>;

  /** Every storage unit whose name contains every term. */
  findStorageUnitsMatching(terms: readonly string[]): Promise<StorageUnit[]>;
}
