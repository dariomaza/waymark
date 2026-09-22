import { type ItemView, flattenUnits } from "@ariadna/api-client";
import { describeFailure, moveRefusedMessage } from "@ariadna/i18n";
import { unitId } from "@ariadna/domain";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { OptionList } from "../ui/atoms/option-list.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useStorageUnitTree } from "../units/unit-queries.js";
import { unitOptions } from "../units/views/unit-options.js";
import { useMoveItems } from "./item-mutations.js";
import { useTranslate } from "../app/language-context.js";

/**
 * Moving one item is a batch of one.
 *
 * `POST /items/move` is all or nothing (ADR 3), so there is one call here and
 * no loop; a refusal means nothing moved, and the sentence says so, because
 * the safe behaviour otherwise reads as a partial one.
 */
export const MoveItemSheet = ({
  item,
  onClose,
}: {
  readonly item: ItemView;
  readonly onClose: () => void;
}): JSX.Element => {
  const t = useTranslate();

  const tree = useStorageUnitTree();
  const move = useMoveItems();
  const [target, setTarget] = useState<string>(item.storageUnitId);

  const refused = t(moveRefusedMessage(move.error));

  return (
    <Sheet title={`Move ${item.name}`} onClose={onClose}>
      <OptionList
        label="Move it into"
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
        label="Move it"
        onPress={() => {
          move.mutate(
            { itemIds: [item.id], targetUnitId: unitId(target) },
            { onSuccess: onClose },
          );
        }}
      >
        Move it
      </Button>
    </Sheet>
  );
};
