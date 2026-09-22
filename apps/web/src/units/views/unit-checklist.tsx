import type { FlatUnit } from "@ariadna/api-client";
import type { UnitId } from "@ariadna/domain";
import type { JSX } from "react";

import { Button } from "../../ui/atoms/button.js";
import { Checkbox } from "../../ui/atoms/checkbox.js";

import "./unit-checklist.css";
import { useTranslate } from "../../app/language-context.js";

export interface UnitChecklistProps {
  readonly units: readonly FlatUnit[];
  readonly isPicked: (id: UnitId) => boolean;
  readonly onToggle: (id: UnitId) => void;
  /** Ticks everything strictly inside this unit. Only on units that hold any. */
  readonly onPickInside: (id: UnitId) => void;
}

/**
 * # Choosing which boxes get a label
 *
 * The house, indented the way it is stored, with a tick against each unit.
 *
 * "Everything inside" is the control the whole feature turns on. Printing all
 * sixty every time is useless and ticking sixty boxes by hand is the chore
 * the one-at-a-time label screen already was — but a location IS a storage
 * unit (ADR 1), so "every box in the garage" is one press, and the afternoon
 * becomes: tick the room, print, cut, stick.
 *
 * It appears only on units that actually hold something, because a button
 * that selects nothing is a button that teaches people not to trust buttons.
 *
 * Presentational: it draws what it is given and reports presses. Which units
 * are ticked lives above it.
 */
export const UnitChecklist = ({
  units,
  isPicked,
  onToggle,
  onPickInside,
}: UnitChecklistProps): JSX.Element => {
  const t = useTranslate();

  return (
    <ul className="unit-checklist" aria-label={t("units.checklistLabel")}>
      {units.map((entry, index) => (
        <li
          className="unit-checklist__row"
          style={{ marginInlineStart: `${String(entry.depth)}rem` }}
          key={entry.unit.id}
        >
          <Checkbox
            label={entry.unit.name}
            checked={isPicked(entry.unit.id)}
            onChange={() => {
              onToggle(entry.unit.id);
            }}
          />
          {holdsSomething(units, index) ? (
            <Button
              tone="quiet"
              onClick={() => {
                onPickInside(entry.unit.id);
              }}
            >
              Everything inside {entry.unit.name}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
);
};

/**
 * The list is depth first, so the unit at `index` holds something exactly
 * when the next one is deeper than it. No second walk of the tree, and no
 * chance of disagreeing with the order on the screen.
 */
const holdsSomething = (units: readonly FlatUnit[], index: number): boolean =>
  (units[index + 1]?.depth ?? -1) > (units[index]?.depth ?? 0);
