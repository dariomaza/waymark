import { type StorageUnitView, flattenUnits } from "@ariadna/api-client";
import { cyclicMoveMessage, describeFailure } from "@ariadna/i18n";
import { unitId } from "@ariadna/domain";
import { useState, type JSX } from "react";
import { View } from "react-native";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { OptionList } from "../ui/atoms/option-list.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useMoveUnit } from "./unit-mutations.js";
import { useStorageUnitTree } from "./unit-queries.js";
import { unitOptions } from "./views/unit-options.js";
import { useTranslate } from "../app/language-context.js";

export interface MoveUnitSheetProps {
  readonly unit: StorageUnitView;
  readonly onClose: () => void;
}

const MAKE_IT_A_ROOT = "";

/**
 * Where should this go?
 *
 * Every unit in the house is offered, including the ones that would make a
 * cycle. That is deliberate: ADR 2 puts the subtree rule in the domain
 * because a foreign key cannot express it, and a picker that quietly hid the
 * illegal options would be this app's own second copy of it. The API refuses,
 * and the refusal is the sentence the person reads.
 */
export const MoveUnitSheet = ({ unit, onClose }: MoveUnitSheetProps): JSX.Element => {
  const t = useTranslate();

  const tree = useStorageUnitTree();
  const move = useMoveUnit(unit.id);
  const [target, setTarget] = useState<string>(unit.parentId ?? MAKE_IT_A_ROOT);

  const cyclic = t(cyclicMoveMessage(move.error, unit.name));

  return (
    <Sheet title={`Move ${unit.name}`} onClose={onClose}>
      <OptionList
        label="Move it into"
        value={target}
        options={[
          { value: MAKE_IT_A_ROOT, label: "Nowhere — make it a root" },
          ...unitOptions(flattenUnits(tree.data?.tree ?? [])),
        ]}
        onChange={setTarget}
      />

      {move.isError ? (
        <Callout tone={cyclic === null ? "wrong" : "blocked"}>
          {cyclic ?? t(describeFailure(move.error))}
        </Callout>
      ) : null}

      <View>
        <Button
          tone="primary"
          block
          disabled={move.isPending}
          label="Move it"
          onPress={() => {
            move.mutate(target === MAKE_IT_A_ROOT ? null : unitId(target), {
              onSuccess: onClose,
            });
          }}
        >
          Move it
        </Button>
      </View>
    </Sheet>
  );
};
