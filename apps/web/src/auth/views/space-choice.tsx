import type { FlatUnit } from "@waymark/api-client";
import { useId, type JSX } from "react";

import { useTranslate } from "../../app/language-context.js";
import { Checkbox } from "../../ui/atoms/checkbox.js";
import "./space-choice.css";

export interface SpaceChoiceProps {
  /** Every space the person can see, in the tree's order. */
  readonly spaces: readonly FlatUnit[];
  readonly chosen: readonly string[];
  readonly onToggle: (spaceId: string) => void;
}

/**
 * The spaces a new machine token may see (ADR 26): one box to tick per space
 * the person can see, each labelled by where it is, because a house has three
 * boxes called `Box 3`. The same flattened tree the move pickers offer, as a
 * list of ticks rather than a single choice.
 *
 * Presentational: it is handed the spaces and what is ticked, and says when
 * something is toggled. Nothing is filtered: ticking a space inside another
 * ticked one adds nothing, and the API keeps only the outer one.
 */
export const SpaceChoice = ({ spaces, chosen, onToggle }: SpaceChoiceProps): JSX.Element => {
  const t = useTranslate();
  const legendId = useId();

  return (
    <fieldset className="space-choice field" aria-labelledby={legendId}>
      <legend className="field__label" id={legendId}>
        {t("tokens.spacesLabel")}
      </legend>
      <p className="field__hint">{t("tokens.spacesHint")}</p>
      <ul className="space-choice__list">
        {spaces.map((entry) => (
          <li key={entry.unit.id}>
            <Checkbox
              label={entry.location}
              checked={chosen.includes(entry.unit.id)}
              onChange={() => {
                onToggle(entry.unit.id);
              }}
            />
          </li>
        ))}
      </ul>
      {chosen.length === 0 ? <p className="field__hint">{t("tokens.chooseASpace")}</p> : null}
    </fieldset>
  );
};
