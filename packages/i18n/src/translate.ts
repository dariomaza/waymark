import type { Dictionary, Message, MessageKey, ValueArgs } from "./dictionary.js";
import { EN } from "./en.js";
import { ES } from "./es.js";
import type { Language } from "./language.js";
import { fill, formatCount, pluralFormOf, type PhraseValues } from "./phrase.js";

const DICTIONARIES: Readonly<Record<Language, Dictionary>> = {
  en: EN,
  es: ES,
};

/**
 * # What a screen holds instead of a string
 *
 * One function, three ways to ask, because a screen has three kinds of thing
 * to say:
 *
 * - a key it wrote itself, with whatever values that sentence needs;
 * - a `Message` somebody else decided — a refusal from the API, which has no
 *   business knowing what language is on screen (see `refusals.ts`);
 * - nothing at all, because most of those refusals are `null` most of the
 *   time, and making every call site check first would put an `=== null`
 *   beside every error message in both apps.
 */
export interface Translate {
  <K extends MessageKey>(key: K, ...values: ValueArgs<K>): string;
  (message: Message): string;
  (message: Message | null): string | null;
}

/**
 * Everything a person reads, in one language.
 *
 * Built once per language rather than looked up per call: each client holds
 * the current one in a context, so a language change re-renders the tree with
 * a different `t` and every sentence on screen changes at once.
 */
export const translator = (language: Language): Translate => {
  const dictionary = DICTIONARIES[language];

  const say = (key: MessageKey, values: Readonly<Record<string, string | number>>): string => {
    const phrase = dictionary[key];

    if (typeof phrase === "string") {
      return fill(phrase, printable(language, values));
    }

    // `count` is required by the types for any phrase with plural forms, so
    // this is the count and not a guess. Falling back to `other` rather than
    // throwing keeps a broken call a wrong sentence instead of a blank screen.
    const count = typeof values["count"] === "number" ? values["count"] : 0;

    return fill(phrase[pluralFormOf(language, count)], printable(language, values));
  };

  function translate(
    first: MessageKey | Message | null,
    values?: Readonly<Record<string, string | number>>,
  ): string | null {
    if (first === null) {
      return null;
    }

    if (typeof first === "string") {
      return say(first, values ?? {});
    }

    return say(first.key, "values" in first ? first.values : {});
  }

  return translate as Translate;
};

/**
 * Numbers become digits HERE, where the language is known, rather than at the
 * call site. A screen counting things should not have to remember that Spanish
 * writes `12.345` — it hands over the number and gets a sentence back.
 */
const printable = (
  language: Language,
  values: Readonly<Record<string, string | number>>,
): PhraseValues =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      typeof value === "number" ? formatCount(language, value) : value,
    ]),
  );
