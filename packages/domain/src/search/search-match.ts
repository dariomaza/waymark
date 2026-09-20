import type { Item } from "../items/item.js";
import type { StorageUnit } from "../storage-units/storage-unit.js";
import { searchTokensOf } from "./search-text.js";

/**
 * Where a query term was found. Also the ranking order: a name is what
 * somebody deliberately called a thing, a tag is a label they deliberately
 * put on it, and a description is prose that happens to mention a word.
 */
export const SearchMatchField = {
  NAME: "NAME",
  TAG: "TAG",
  DESCRIPTION: "DESCRIPTION",
} as const;

export type SearchMatchField =
  (typeof SearchMatchField)[keyof typeof SearchMatchField];

/** Best first. The array order IS the ranking rule, in one place. */
const FIELD_RANK: readonly SearchMatchField[] = [
  SearchMatchField.NAME,
  SearchMatchField.TAG,
  SearchMatchField.DESCRIPTION,
];

export interface SearchMatch {
  /**
   * Every field at least one term was found in, best field first. Non-empty
   * for a match, and enough for a client to say WHY a result is there.
   */
  readonly matchedFields: readonly SearchMatchField[];
  /**
   * The best field that answers the whole query ON ITS OWN, or `null` when it
   * took several fields together.
   *
   * The distinction matters: an item called `Cable HDMI` tagged `video` does
   * answer `cable video`, but neither its name nor its tags answer it alone,
   * and ranking it as a name match would put it above an item actually called
   * `Cable de video`.
   */
  readonly rankedBy: SearchMatchField | null;
  /** How completely `rankedBy` answers the query, from 0 to 1. */
  readonly relevance: number;
}

/**
 * A term found as a whole word is worth twice one found as the start of a
 * longer word, so `cable` ranks `Cable` above `Cablerio` while the prefix is
 * still a match — which is what makes the results useful before the word is
 * finished.
 */
const WHOLE_WORD = 1;
const PREFIX = 0.5;

const termScore = (term: string, tokens: readonly string[]): number => {
  let best = 0;

  for (const token of tokens) {
    if (token === term) {
      return WHOLE_WORD;
    }
    if (token.startsWith(term)) {
      best = PREFIX;
    }
  }

  return best;
};

/**
 * How well one field answers the WHOLE query: zero unless every term is in it.
 * A field that answers half the query does not rank the result, it only
 * explains it.
 */
const fieldRelevance = (
  terms: readonly string[],
  tokens: readonly string[],
): number => {
  let total = 0;

  for (const term of terms) {
    const score = termScore(term, tokens);
    if (score === 0) {
      return 0;
    }
    total += score;
  }

  return total / terms.length;
};

type FieldTokens = readonly (readonly [SearchMatchField, readonly string[]])[];

const matchFields = (
  fields: FieldTokens,
  terms: readonly string[],
): SearchMatch | null => {
  if (terms.length === 0) {
    return null;
  }

  const matchedFields: SearchMatchField[] = [];
  const found = new Set<string>();
  const everyToken: string[] = [];

  for (const field of FIELD_RANK) {
    const tokens = fields
      .filter(([candidate]) => candidate === field)
      .flatMap(([, fieldTokens]) => fieldTokens);
    if (tokens.length === 0) {
      continue;
    }

    everyToken.push(...tokens);

    const hits = terms.filter((term) => termScore(term, tokens) > 0);
    if (hits.length === 0) {
      continue;
    }

    matchedFields.push(field);
    for (const hit of hits) {
      found.add(hit);
    }
  }

  // Every term, or nothing. Answering half a query is answering a different
  // one, and a result nobody asked for is worse than no result at all.
  if (found.size !== terms.length) {
    return null;
  }

  for (const field of matchedFields) {
    const tokens = fields
      .filter(([candidate]) => candidate === field)
      .flatMap(([, fieldTokens]) => fieldTokens);
    const relevance = fieldRelevance(terms, tokens);
    if (relevance > 0) {
      return { matchedFields, rankedBy: field, relevance };
    }
  }

  return {
    matchedFields,
    rankedBy: null,
    relevance: fieldRelevance(terms, everyToken),
  };
};

/**
 * Whether an item answers the query, and why.
 *
 * Tags are searched as first-class text rather than as metadata, because the
 * whole reason to write `cables` on an `HDMI 2.1` is so that searching for
 * `cables` finds it. A tag that only a filter dropdown can reach is a tag
 * nobody will ever type.
 */
export const matchItem = (
  item: Item,
  terms: readonly string[],
): SearchMatch | null =>
  matchFields(
    [
      [SearchMatchField.NAME, searchTokensOf(item.name)],
      [SearchMatchField.TAG, item.tags.flatMap(searchTokensOf)],
      [
        SearchMatchField.DESCRIPTION,
        item.description === null ? [] : searchTokensOf(item.description),
      ],
    ],
    terms,
  );

/**
 * Whether a storage unit answers the query. By name only: finding the box is
 * as useful as finding the thing in it, and a box is its name — its
 * description is a note to self about what it holds, and what it holds is
 * already searchable as items.
 */
export const matchStorageUnit = (
  unit: StorageUnit,
  terms: readonly string[],
): SearchMatch | null =>
  matchFields([[SearchMatchField.NAME, searchTokensOf(unit.name)]], terms);

const rankOf = (field: SearchMatchField | null): number =>
  field === null ? FIELD_RANK.length : FIELD_RANK.indexOf(field);

/**
 * Best first. Returns 0 for two equally good matches so the caller can break
 * the tie with something stable — a total order is what stops two reads of an
 * unchanged inventory from listing the same results in a different sequence.
 */
export const compareSearchMatches = (
  left: SearchMatch,
  right: SearchMatch,
): number =>
  rankOf(left.rankedBy) - rankOf(right.rankedBy) ||
  right.relevance - left.relevance;
