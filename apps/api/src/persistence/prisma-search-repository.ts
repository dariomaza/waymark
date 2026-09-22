import type { Item, SearchRepository, StorageUnit } from "@waymark/domain";
import type { PrismaClient } from "@prisma/client";

import { ITEM_RELATIONS, toDomainItem } from "./item-mapper.js";
import { toDomainStorageUnit } from "./storage-unit-mapper.js";

/**
 * Search over the SQLite FTS5 index the migration installs (ADR 11).
 *
 * # Why an index at all
 *
 * The honest alternative was to scan: fold every name, tag and description in
 * the database on every keystroke and compare in JavaScript. That is always
 * right and never stale, and it is what the in-memory repository does. It was
 * rejected for the one reason that matters here — accent folding cannot be
 * expressed in a SQL predicate, so a scan means loading every item and every
 * unit into the process for every query, and search-as-you-type fires one per
 * keystroke on a phone over a home connection.
 *
 * The cost of an index is that it can go stale, and a stale index does not
 * fail: it quietly stops finding a box. That is paid for with triggers rather
 * than with application code. The index is rebuilt by the database, inside the
 * same transaction as the write that changed the row, on INSERT, UPDATE and
 * DELETE of `Item`, `ItemTag` and `StorageUnit`. There is no write path that
 * can skip it — not this adapter, not a migration, not a `sqlite3` prompt —
 * because there is no application code in the loop at all.
 *
 * `SearchInventory` then re-checks every candidate against the query with the
 * same folding rules, so even a hypothetical stale row cannot become a wrong
 * answer; it can only become a missing one, which is what the triggers are
 * for.
 *
 * # Why the MATCH does not do more
 *
 * No scope, no order, no limit. FTS5 could do all three, and doing them here
 * would make the Prisma adapter and the in-memory one different in ways their
 * shared contract could never pin down. Ranking in particular is a product
 * rule — a name beats a tag beats a description — and bm25 is not a rule, it
 * is a number that depends on how many other rows happen to contain the word.
 */
export class PrismaSearchRepository implements SearchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findItemsMatching(terms: readonly string[]): Promise<Item[]> {
    const expression = toMatchExpression(terms);
    if (expression === null) {
      return [];
    }

    const matches = await this.prisma.$queryRaw<{ itemId: string }[]>`
      SELECT "itemId" FROM "ItemSearch" WHERE "ItemSearch" MATCH ${expression}
    `;
    if (matches.length === 0) {
      return [];
    }

    const rows = await this.prisma.item.findMany({
      where: { id: { in: matches.map((match) => match.itemId) } },
      include: ITEM_RELATIONS,
    });

    return rows.map(toDomainItem);
  }

  async findStorageUnitsMatching(
    terms: readonly string[],
  ): Promise<StorageUnit[]> {
    const expression = toMatchExpression(terms);
    if (expression === null) {
      return [];
    }

    const matches = await this.prisma.$queryRaw<{ unitId: string }[]>`
      SELECT "unitId" FROM "StorageUnitSearch" WHERE "StorageUnitSearch" MATCH ${expression}
    `;
    if (matches.length === 0) {
      return [];
    }

    const rows = await this.prisma.storageUnit.findMany({
      where: { id: { in: matches.map((match) => match.unitId) } },
    });

    return rows.map(toDomainStorageUnit);
  }
}

/**
 * The terms as an FTS5 query: every one of them a prefix, all of them
 * required. `null` when there is nothing to look for, because an empty MATCH
 * is a syntax error rather than "everything".
 *
 * Each term is quoted, which turns it into a literal string rather than FTS5
 * syntax — so a term that happens to spell `NOT` or `OR` is a word and not an
 * operator. `toSearchTerms` has already reduced them to letters and digits, so
 * the escaping is belt and braces; it stays because the day that changes, this
 * would otherwise become a query injection with a search box in front of it.
 */
const toMatchExpression = (terms: readonly string[]): string | null => {
  if (terms.length === 0) {
    return null;
  }

  return terms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(" ");
};
