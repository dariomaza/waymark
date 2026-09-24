import type { FlatUnit } from "@waymark/api-client";
import type { UnitId } from "@waymark/domain";
import type { JSX } from "react";
import { StyleSheet, View } from "react-native";

import { useTranslate } from "../../app/language-context.js";
import { Button } from "../../ui/atoms/button.js";
import { Checkbox } from "../../ui/atoms/checkbox.js";
import { space } from "../../ui/styles/tokens.js";

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
 * The house, indented the way it is stored, with a tick against each unit. The
 * browser's twin of this file carries the same argument in the same words, and
 * the two are the same control: presentational, drawing what it is given and
 * reporting presses.
 *
 * "Everything inside" is the control the whole feature turns on. Printing all
 * sixty every time is useless and ticking sixty boxes by hand is the chore the
 * one-at-a-time label screen already was — but a location IS a storage unit
 * (ADR 1), so "every box in the garage" is one press, and the afternoon becomes:
 * tick the room, print, cut, stick.
 *
 * It appears only on units that actually hold something, because a button that
 * selects nothing is a button that teaches people not to trust buttons.
 */
export const UnitChecklist = ({
  units,
  isPicked,
  onToggle,
  onPickInside,
}: UnitChecklistProps): JSX.Element => {
  const t = useTranslate();

  return (
    <View style={styles.list} accessibilityLabel={t("units.checklistLabel")}>
      {units.map((entry, index) => (
        <View
          key={entry.unit.id}
          style={[styles.row, { marginLeft: entry.depth * space.s4 }]}
        >
          <Checkbox
            label={entry.unit.name}
            checked={isPicked(entry.unit.id)}
            onPress={() => {
              onToggle(entry.unit.id);
            }}
          />
          {holdsSomething(units, index) ? (
            <Button
              tone="quiet"
              onPress={() => {
                onPickInside(entry.unit.id);
              }}
            >
              {t("units.everythingInside", { name: entry.unit.name })}
            </Button>
          ) : null}
        </View>
      ))}
    </View>
  );
};

/**
 * The list is depth first, so the unit at `index` holds something exactly when
 * the next one is deeper than it. No second walk of the tree, and no chance of
 * disagreeing with the order on the screen.
 */
const holdsSomething = (units: readonly FlatUnit[], index: number): boolean =>
  (units[index + 1]?.depth ?? -1) > (units[index]?.depth ?? 0);

const styles = StyleSheet.create({
  list: { gap: space.s1 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.s2 },
});
