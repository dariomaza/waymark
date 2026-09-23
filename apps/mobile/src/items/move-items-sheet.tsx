import { flattenUnits } from "@waymark/api-client";
import { describeFailure, moveRefusedMessage } from "@waymark/i18n";
import { unitId, type ItemId } from "@waymark/domain";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { OptionList } from "../ui/atoms/option-list.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useStorageUnitTree } from "../units/unit-queries.js";
import { unitOptions } from "../units/views/unit-options.js";
import { useMoveItems } from "./item-mutations.js";
import { useTranslate } from "../app/language-context.js";

export interface MoveItemsSheetProps {
  readonly itemIds: readonly ItemId[];
  /** "Move 3 items", already counted by whoever opened this. */
  readonly title: string;
  readonly onClose: () => void;
  readonly onMoved: () => void;
}

/**
 * Where a handful of things are going.
 *
 * `MoveItemSheet` beside it does the same for ONE thing, and the two are
 * deliberately not folded together: that one starts on the unit the item is
 * already in and is titled with the thing's name, while this one starts on
 * nothing — there is no single "current" unit for a selection that may span
 * the whole house — and is titled with a count. The request is identical,
 * because `POST /items/move` never cared how many there were.
 *
 * A refusal leaves the selection alone. It is all or nothing (ADR 3), so
 * nothing moved, and throwing away what somebody just picked would make them
 * pick it again to find out whether the second attempt works.
 */
export const MoveItemsSheet = ({
  itemIds,
  title,
  onClose,
  onMoved,
}: MoveItemsSheetProps): JSX.Element => {
  const t = useTranslate();

  const tree = useStorageUnitTree();
  const move = useMoveItems();
  const [target, setTarget] = useState("");

  const refused = t(moveRefusedMessage(move.error));

  return (
    <Sheet title={title} onClose={onClose}>
      <OptionList
        label={t("items.moveThemInto")}
        value={target}
        options={unitOptions(flattenUnits(tree.data?.tree ?? []))}
        onChange={setTarget}
      />

      {move.isError ? (
        <Callout tone="wrong">{refused ?? t(describeFailure(move.error))}</Callout>
      ) : null}

      <Button
        tone="primary"
        block
        disabled={move.isPending || target === ""}
        label={t("items.moveThem")}
        onPress={() => {
          move.mutate(
            { itemIds, targetUnitId: unitId(target) },
            {
              onSuccess: () => {
                onMoved();
                onClose();
              },
            },
          );
        }}
      >
        {t("items.moveThem")}
      </Button>
    </Sheet>
  );
};
