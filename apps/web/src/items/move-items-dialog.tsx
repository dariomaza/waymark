import { unitId, type ItemId } from "@ariadna/domain";
import { useState, type JSX } from "react";

import { describeFailure } from "@ariadna/api-client";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { SelectField } from "../ui/atoms/select-field.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { flattenUnits } from "../units/flatten-tree.js";
import { useStorageUnitTree } from "../units/unit-queries.js";
import { unitOptions } from "../units/views/unit-options.js";
import { moveRefusedMessage } from "./item-messages.js";
import { useMoveItems } from "./item-mutations.js";

export interface MoveItemsDialogProps {
  readonly itemIds: readonly ItemId[];
  readonly title: string;
  /** "Move it into" for one, "Move them into" for a selection. */
  readonly targetLabel: string;
  readonly confirmLabel: string;
  readonly onClose: () => void;
  readonly onMoved?: (() => void) | undefined;
}

/**
 * One dialog for moving one item and for moving forty, because the API has
 * one route for both. The words differ; the request does not.
 */
export const MoveItemsDialog = ({
  itemIds,
  title,
  targetLabel,
  confirmLabel,
  onClose,
  onMoved,
}: MoveItemsDialogProps): JSX.Element => {
  const tree = useStorageUnitTree();
  const move = useMoveItems();
  const [target, setTarget] = useState("");

  const refused = moveRefusedMessage(move.error);

  return (
    <Sheet title={title} onClose={onClose}>
      <SelectField
        id="move-items-target"
        label={targetLabel}
        value={target}
        options={[
          { value: "", label: "Choose a unit…" },
          ...unitOptions(flattenUnits(tree.data?.tree ?? [])),
        ]}
        onChange={(event) => {
          setTarget(event.target.value);
        }}
      />

      {move.isError ? (
        <Callout tone="wrong">{refused ?? describeFailure(move.error)}</Callout>
      ) : null}

      <div className="sheet__buttons">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          tone="primary"
          disabled={move.isPending || target === ""}
          onClick={() => {
            move.mutate(
              { itemIds, targetUnitId: unitId(target) },
              {
                onSuccess: () => {
                  onMoved?.();
                  onClose();
                },
              },
            );
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
};
