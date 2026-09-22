import type { EN } from "./en.js";
import type { PluralForm } from "./phrase.js";

/**
 * A sentence that changes with a number.
 *
 * The WHOLE sentence changes, not a suffix on the end of a noun. That is the
 * difference between a translation layer and a pluraliser: English can get
 * away with gluing an `s` on, Spanish cannot — `1 unidad` and `2 unidades`
 * agree in number, and anything else in the sentence agrees with them. Giving
 * each form its own line is what lets a translator write the sentence rather
 * than fill in a blank.
 */
export type PluralPhrase = { readonly [Form in PluralForm]: string };

export type Phrase = string | PluralPhrase;

/** Every name a screen can ask for. */
export type MessageKey = keyof typeof EN;

type Source = typeof EN;

/**
 * # What a dictionary must be, derived from the English one
 *
 * This is the whole type-checking story in three lines. `Dictionary` has
 * exactly the keys English has, so:
 *
 * - a key Spanish has not translated is a missing property — a build error;
 * - a key Spanish has that English does not is an excess property — a build
 *   error;
 * - a key English counts with and Spanish does not is the wrong shape — a
 *   build error.
 *
 * None of those can reach a person as a key name rendered on a label. The
 * literal English strings are widened back to `string` on the way through,
 * because Spanish obviously must not be forced to say "Places".
 */
export type Dictionary = {
  readonly [K in MessageKey]: Source[K] extends string ? string : PluralPhrase;
};

/**
 * The names inside the braces of a sentence, read off the sentence itself.
 *
 * This is why the English dictionary is `as const`: with the literal string in
 * the type, TypeScript can pull `{username}` out of it and insist the caller
 * hands one over. A screen that asks for `units.signedInAs` and forgets the
 * username does not compile, and a screen that hands over a `usernam` does not
 * either.
 */
type HolesIn<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | HolesIn<Rest>
  : never;

/**
 * Both plural forms are read, and `count` is always required for a phrase
 * that has them — even when no form actually prints it. The number is what
 * CHOOSES the sentence, so it is needed whether or not it is shown, and
 * `{count, plural, one {a thing} other {some things}}` is a real sentence
 * somebody will want to write one day.
 */
type HolesOf<P extends Phrase> = P extends string
  ? HolesIn<P>
  : P extends PluralPhrase
    ? "count" | HolesIn<P["one"]> | HolesIn<P["other"]>
    : never;

/**
 * A count is a number, so this layer can print it the way the language does
 * rather than receive it already glued into a string. Everything else may be
 * either: a name is a string, and a number that is not being counted (a
 * photo limit, a position in a list) should not have to be stringified at
 * every call site.
 */
export type ValuesFor<K extends MessageKey> = {
  readonly [Hole in HolesOf<Source[K]>]: Hole extends "count" ? number : string | number;
};

/**
 * Nothing to hand over means nothing may be handed over. `t("nav.places")`
 * takes no second argument at all rather than an empty object, and a screen
 * that passes values to a sentence with no holes is told so.
 */
export type ValueArgs<K extends MessageKey> = [HolesOf<Source[K]>] extends [never]
  ? []
  : [values: ValuesFor<K>];

/**
 * # A sentence decided in one place and said in another
 *
 * Which refusal an `ApiError` becomes is shared by both clients and has
 * nothing to do with what is on screen; which language it is said in has
 * nothing to do with the API. A `Message` is the join: the key and the
 * numbers travel, and the words are looked up wherever there is a person.
 *
 * It is a union over the keys rather than `{ key: MessageKey; values?: ... }`
 * so that the values still have to match the key they are sent with.
 */
export type Message = {
  [K in MessageKey]: [HolesOf<Source[K]>] extends [never]
    ? { readonly key: K }
    : { readonly key: K; readonly values: ValuesFor<K> };
}[MessageKey];

/**
 * Builds a `Message` with the same checking a direct `t(...)` call gets.
 *
 * Without it every refusal would need a cast, because TypeScript cannot tell
 * that the `K` in `{ key, values }` is the same `K` on both sides of an
 * object literal typed by a union.
 */
export const message = <K extends MessageKey>(key: K, ...values: ValueArgs<K>): Message =>
  ({ key, ...(values.length === 0 ? {} : { values: values[0] }) }) as Message;
