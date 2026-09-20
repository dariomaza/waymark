/**
 * # How text is compared when somebody searches
 *
 * The person using Ariadna writes Spanish, on a phone, one-handed, in a cold
 * garage. `camara` has to find `cámara` and `cámara` has to find `camara`,
 * because they are the same word and only one of them is convenient to type.
 * The way to make that true in BOTH directions is to fold the query and the
 * stored text through the exact same function, so the comparison never sees an
 * accent at all.
 *
 * The folding is deliberately simple and total: decompose, drop the combining
 * marks, lower case. It is not a Spanish rule — it is the same rule SQLite's
 * `unicode61` tokenizer applies with `remove_diacritics 2`, which is what
 * indexes this text on the other side of the port (ADR 11). Two different
 * normalizations would mean the index and the domain disagree about what a
 * word is, and that disagreement is invisible until somebody cannot find a box.
 *
 * `ñ` folds to `n` as a side effect. That is the right side effect here:
 * `niños` typed as `ninos` is a search somebody will make, and a household
 * inventory has no pair of words that only that letter tells apart.
 */

/** Decomposed, stripped of combining marks, lower case. */
export const foldSearchText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();

/**
 * A word is a run of letters or digits, and everything else separates.
 *
 * `HDMI 2.1` is therefore `hdmi`, `2`, `1` rather than one token nobody would
 * type the same way twice. Matching a term against the START of a token is
 * what makes `cab` find `cables`, so tokens have to be words rather than whole
 * fields: a prefix of a field would only ever match from its first letter.
 */
export const searchTokensOf = (value: string): string[] =>
  foldSearchText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);

/**
 * What a query is looking for, in the order it was written, without repeats.
 *
 * Empty for a query that carries no letters and no digits, which is how "the
 * user has typed nothing yet" reaches the rest of the search as data rather
 * than as a special case. A repeated word is dropped because it says nothing
 * new and would otherwise weigh twice in the score.
 */
export const toSearchTerms = (query: string): string[] => [
  ...new Set(searchTokensOf(query)),
];
