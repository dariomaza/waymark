/**
 * What fills the photo slot of a thing that has no photo yet.
 *
 * That slot is not an edge case: an inventory is built by registering forty
 * things in an afternoon and photographing them another day, so the initials
 * are what most of the grid looks like at the start. They have to read as an
 * informed gap — this is that thing, it has no picture — rather than as
 * invented content or as a failure to load.
 *
 * Shared by both clients for the same reason everything else here is: the two
 * of them disagreeing about what a thing is called would be visible.
 */

/**
 * Anything that separates words when somebody types a name one-handed.
 *
 * Deliberately not "not a letter": a name can begin with a digit or an emoji,
 * and both are perfectly good first characters to show. Only the connectors
 * are dropped.
 */
const SEPARATORS = /[[\s\p{P}\p{S}]--[\p{Emoji_Presentation}]]+/gv;

const MAX = 2;

/**
 * Up to two characters, from the first two words, uppercased.
 *
 * Iterates by code POINT rather than by code unit, because an emoji is one
 * character to the person who typed it and two to JavaScript, and half a
 * surrogate pair on screen is a mystery nobody can act on.
 */
export const initialsOf = (name: string): string =>
  name
    .split(SEPARATORS)
    .filter((word) => word !== "")
    .slice(0, MAX)
    .map((word) => [...word][0] ?? "")
    .join("")
    .toLocaleUpperCase();
