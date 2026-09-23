import type {
  ItemSearchResultView,
  SearchResponse,
  StorageUnitSearchResultView,
} from "@waymark/api-client";
import { unitId } from "@waymark/domain";

import {
  counted,
  detailLine,
  idOf,
  itemFacts,
  matchReason,
  paragraphs,
  unitName,
} from "../render.js";
import type { McpApiClient } from "../waymark.js";

export interface SearchArguments {
  readonly query: string;
  /** A subtree to look inside, at any depth. A location IS a unit (ADR 1). */
  readonly withinStorageUnitId?: string | undefined;
  readonly limit?: number | undefined;
}

/**
 * # The tool the whole thing exists for
 *
 * "Which box is the soldering iron in" is the question, and the only useful
 * answer to it is a PLACE. So every hit carries its full breadcrumb, root
 * first, exactly as the API hands it over — a list of names with no locations
 * would be this server telling somebody what they already own.
 *
 * Nothing is filtered, ranked or trimmed here. The order is the API's promise
 * (the ranking is computed in `packages/domain`, from the entities, because it
 * is product judgement), `within` is a subtree the API resolves, and `limit`
 * is the API's. A client that re-sorted would be freezing a ranking rule that
 * is meant to improve.
 */
export const searchInventory = async (
  client: McpApiClient,
  args: SearchArguments,
): Promise<string> => {
  const results = await client.search({
    query: args.query,
    ...(args.withinStorageUnitId === undefined
      ? {}
      : { within: unitId(args.withinStorageUnitId) }),
    ...(args.limit === undefined ? {} : { limit: args.limit }),
  });

  if (results.items.length === 0 && results.storageUnits.length === 0) {
    return nothingMatched(results);
  }

  return paragraphs(
    headline(results),
    itemsBlock(results.items),
    unitsBlock(results.storageUnits),
  );
};

const headline = (results: SearchResponse): string =>
  `"${results.query}" matches ${counted(results.items.length, "item")} and ` +
  `${counted(results.storageUnits.length, "storage unit")}.`;

/**
 * Two lists, never one. They answer two different questions — "where is my
 * drill" and "where is Box 3" — and interleaving them would need a made-up
 * rule for whether a box called `Cables` beats an item tagged `cables`. The
 * API refuses to invent one; so does this.
 */
const itemsBlock = (hits: readonly ItemSearchResultView[]): string | null => {
  if (hits.length === 0) {
    return null;
  }

  return [
    "ITEMS",
    ...hits.map((hit) =>
      [
        `${hit.item.name} — ${hit.location}`,
        `  ${detailLine([
          ...itemFacts(hit.item),
          matchReason(hit.matchedFields),
          idOf(hit.item.id),
        ])}`,
      ].join("\n"),
    ),
  ].join("\n");
};

const unitsBlock = (hits: readonly StorageUnitSearchResultView[]): string | null => {
  if (hits.length === 0) {
    return null;
  }

  return [
    "STORAGE UNITS",
    ...hits.map((hit) =>
      [
        `${unitName(hit.unit)} — ${hit.location}`,
        `  ${detailLine([matchReason(hit.matchedFields), idOf(hit.unit.id)])}`,
      ].join("\n"),
    ),
  ].join("\n");
};

/**
 * Nothing found is a result, not a failure, and the useful thing to say about
 * it is the RULE — because the commonest cause of an empty answer here is a
 * reader who typed a sentence and expected any of it to match.
 *
 * Accents are not a cause and are deliberately not mentioned: the API folds
 * them in both directions, so `camara` finds `cámara`, and warning about a
 * problem that cannot happen would send somebody to fix the wrong thing.
 */
const nothingMatched = (results: SearchResponse): string =>
  paragraphs(
    `Nothing in Waymark matches "${results.query}".`,
    `It was searched for as ${results.terms.length === 0 ? "no terms at all" : results.terms.map((term) => `"${term}"`).join(" and ")}. ` +
      "Every term has to match, and a term matches the start of a word — so a " +
      "second word narrows the search rather than widening it. Try fewer words.",
  );
