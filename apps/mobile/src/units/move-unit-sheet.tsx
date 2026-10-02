import { type StorageUnitView, editableUnits } from "@waymark/api-client";
import { cyclicMoveMessage, describeFailure } from "@waymark/i18n";
import { unitId } from "@waymark/domain";
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
  /**
   * Whether it may become a top-level space (ADR 26): its owner's call, so a
   * space somebody was shared with edit on cannot be lifted out of the tree
   * it was shared in. Not offered at all when it may not, rather than offered
   * and refused.
   */
  readonly mayMoveToTop: boolean;
  readonly onClose: () => void;
}

const MAKE_IT_A_ROOT = "";

/**
 * Where should this go?
 *
 * Every unit the person may put something in is offered (ADR 26), including
 * the ones that would make a cycle. That is deliberate: ADR 2 puts the subtree rule in the domain
 * because a foreign key cannot express it, and a picker that quietly hid the
 * illegal options would be this app's own second copy of it. The API refuses,
 * and the refusal is the sentence the person reads.
 */
export const MoveUnitSheet = ({
  unit,
  mayMoveToTop,
  onClose,
}: MoveUnitSheetProps): JSX.Element => {
  const t = useTranslate();

  const tree = useStorageUnitTree();
  const move = useMoveUnit(unit.id);
  const [target, setTarget] = useState<string | null>(
    unit.parentId ?? (mayMoveToTop ? MAKE_IT_A_ROOT : null),
  );

  const cyclic = t(cyclicMoveMessage(move.error, unit.name));

  return (
    <Sheet title={t("sheet.move", { name: unit.name })} onClose={onClose}>
      <OptionList
        label={t("units.moveInto")}
        value={target}
        options={[
          ...(mayMoveToTop ? [{ value: MAKE_IT_A_ROOT, label: t("units.nowhereRoot") }] : []),
          ...unitOptions(editableUnits(tree.data?.tree ?? [])),
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
          disabled={move.isPending || target === null}
          label={t("units.moveIt")}
          onPress={() => {
            if (target === null) {
              return;
            }
            move.mutate(target === MAKE_IT_A_ROOT ? null : unitId(target), {
              onSuccess: onClose,
            });
          }}
        >
          {t("units.moveIt")}
        </Button>
      </View>
    </Sheet>
  );
};
