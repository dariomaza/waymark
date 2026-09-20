import { useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";

import type { ItemView, StorageUnitView } from "../api/contract.js";
import { describeFailure } from "../api/describe-failure.js";
import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useDeleteItem } from "./item-mutations.js";
import { MoveItemsDialog } from "./move-items-dialog.js";

export interface ItemActionsProps {
  readonly item: ItemView;
  /** Where it currently is, so a delete can go back there. */
  readonly holder: StorageUnitView | null;
}

/**
 * What can be done to one item.
 *
 * There is no edit here: the API exposes create, move and delete for items
 * and no update route. Renaming one means deleting and adding it again,
 * which is worth saying out loud rather than hiding behind a disabled
 * button.
 */
export const ItemActions = ({ item, holder }: ItemActionsProps): JSX.Element => {
  const [open, setOpen] = useState<"move" | "delete" | null>(null);
  const navigate = useNavigate();
  const remove = useDeleteItem(item.id);

  const close = (): void => {
    setOpen(null);
  };

  return (
    <>
      <Button
        onClick={() => {
          setOpen("move");
        }}
      >
        Move
      </Button>
      <Button
        tone="danger"
        onClick={() => {
          setOpen("delete");
        }}
      >
        Delete
      </Button>

      {open === "move" ? (
        <MoveItemsDialog
          itemIds={[item.id]}
          title={`Move ${item.name}`}
          targetLabel="Move it into"
          confirmLabel="Move it"
          onClose={close}
        />
      ) : null}

      {open === "delete" ? (
        <Sheet title={`Delete ${item.name}`} onClose={close}>
          <p>
            Deleting {item.name} cannot be undone, and its photos are deleted with
            it.
          </p>
          {remove.isError ? (
            <Callout tone="wrong">{describeFailure(remove.error)}</Callout>
          ) : null}
          <div className="sheet__buttons">
            <Button onClick={close}>Cancel</Button>
            <Button
              tone="danger"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(undefined, {
                  onSuccess: () => {
                    close();
                    navigate(holder === null ? "/" : `/units/${holder.id}`, {
                      replace: true,
                    });
                  },
                });
              }}
            >
              Delete this item
            </Button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
};
