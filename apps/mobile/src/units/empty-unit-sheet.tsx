import { describeFailure, flattenUnits, type StorageUnitView } from "@ariadna/api-client";
import { unitId, type UnitId } from "@ariadna/domain";
import { useState, type JSX } from "react";
import { Text } from "react-native";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { OptionList } from "../ui/atoms/option-list.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { colors, text } from "../ui/styles/tokens.js";
import { useEmptyUnit } from "./unit-mutations.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { unitOptions } from "./views/unit-options.js";

export interface EmptyUnitSheetProps {
  readonly unit: StorageUnitView;
  /** The unit one level up, when there is one. */
  readonly parent: StorageUnitView | null;
  readonly onClose: () => void;
}

/**
 * Emptying moves everything one level up — or into a unit chosen here, which
 * a root has no alternative to: it has no parent, and the API answers
 * `MISSING_EMPTY_TARGET` rather than guessing. Asking first is friendlier
 * than showing that refusal, and it is the same rule either way.
 */
export const EmptyUnitSheet = ({
  unit,
  parent,
  onClose,
}: EmptyUnitSheetProps): JSX.Element => {
  const tree = useStorageUnitTree();
  const empty = useEmptyUnit(unit.id);
  const [target, setTarget] = useState<string>("");

  const needsTarget = parent === null;
  const chosen: UnitId | undefined =
    needsTarget && target !== "" ? unitId(target) : undefined;

  return (
    <Sheet title={`Empty ${unit.name}`} onClose={onClose}>
      {needsTarget ? (
        <>
          <Text style={styles.text}>
            A root unit has no parent to empty into. Everything inside {unit.name} has to
            go somewhere else.
          </Text>
          <OptionList
            label="Move everything into"
            value={target}
            options={unitOptions(
              flattenUnits(tree.data?.tree ?? []).filter(
                (entry) => entry.unit.id !== unit.id,
              ),
            )}
            onChange={setTarget}
          />
        </>
      ) : (
        <Text style={styles.text}>
          Everything inside {unit.name} moves up into {parent.name}. Nothing is deleted.
        </Text>
      )}

      {empty.isError ? (
        <Callout tone="wrong">{describeFailure(empty.error)}</Callout>
      ) : null}

      <Button
        tone="primary"
        block
        disabled={empty.isPending || (needsTarget && chosen === undefined)}
        label="Empty it"
        onPress={() => {
          empty.mutate(chosen, { onSuccess: onClose });
        }}
      >
        Empty it
      </Button>
    </Sheet>
  );
};

const styles = { text: { color: colors.ink, fontSize: text.m, lineHeight: 22 } } as const;
