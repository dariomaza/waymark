import type { JSX } from "react";

import { Icon, type IconName } from "./icon.js";
import "./segmented.css";

/** One answer: what it is called aloud, and what is drawn for it. */
export interface SegmentedOption<Value extends string> {
  readonly value: Value;
  /** The whole accessible name. Never drawn: the picture or the letters are. */
  readonly name: string;
  /** A picture from the icon set, or a few letters. Exactly one of the two. */
  readonly drawn: { readonly icon: IconName } | { readonly letters: string };
}

export interface SegmentedProps<Value extends string> {
  /** The radios' shared `name`, so the browser knows they are one question. */
  readonly group: string;
  /** The id of the visible words that name this question. */
  readonly labelledBy: string;
  readonly value: Value;
  readonly options: readonly SegmentedOption<Value>[];
  readonly onChoose: (value: Value) => void;
}

/**
 * # One either-or setting, drawn one way
 *
 * The language was a 31px pill and the appearance a 48px bordered row of three
 * words, side by side on one screen: two controls for one kind of question,
 * and one of them under the floor a thumb needs. This is both of them, so the
 * two cannot disagree again.
 *
 * Real radios in a `fieldset`, so a keyboard and a screen reader get the
 * grouping and the current answer for free. The group is named by the words
 * beside it (`labelledBy`) rather than by a legend of its own, because the
 * setting's name is already written once on the row and a second, hidden copy
 * would be read out twice.
 *
 * Every answer is drawn as a picture or as two letters — never as a word, which
 * is what made the appearance control wider than the language one — and is
 * CALLED by its whole name, which is read aloud and drawn nowhere. "ES" read
 * aloud is two letters; a sun is not a name.
 *
 * The phone draws the same control, at the same size, from `ui/atoms/segmented.tsx`.
 */
export const Segmented = <Value extends string>({
  group,
  labelledBy,
  value,
  options,
  onChoose,
}: SegmentedProps<Value>): JSX.Element => (
  <fieldset className="segmented" aria-labelledby={labelledBy}>
    {options.map((option) => (
      <label key={option.value} className="segmented__option">
        <input
          type="radio"
          name={group}
          value={option.value}
          checked={value === option.value}
          onChange={() => {
            onChoose(option.value);
          }}
        />
        {"icon" in option.drawn ? (
          <Icon name={option.drawn.icon} size={20} />
        ) : (
          <span aria-hidden="true">{option.drawn.letters}</span>
        )}
        <span className="segmented__name">{option.name}</span>
      </label>
    ))}
  </fieldset>
);
