import type { Language } from "./language.js";

/**
 * # A date in as few characters as are true
 *
 * The day and the short month, in the language on screen — and the year only
 * when it is not the current one. A row of the account screen that said "Last
 * used 20 Sept 2026" wrapped onto a second line on a phone for a year its
 * reader already knew. Both clients draw these rows, so the rule is written
 * once, here, with the words it goes into.
 *
 * `now` is a parameter so the rule can be tested on a fixed day.
 */
export const shortDate = (moment: string, language: Language, now: Date = new Date()): string => {
  const date = new Date(moment);

  return date.toLocaleDateString(language, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
};
