import {
  describeFailure,
  type ItemView,
  type StorageUnitView,
} from "@ariadna/api-client";
import { useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { EditItemDialog } from "./edit-item-dialog.js";
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
 * "Edit" changes what the item says about itself — its name, its quantity,
 * its tags. "Move" changes which box holds it. They are two buttons because
 * they are two different acts, and only one of them can make the inventory
 * lie about where something is.
 */
export const ItemActions = ({ item, holder }: ItemActionsProps): JSX.Element => {
  const [open, setOpen] = useState<"edit" | "move" | "delete" | null>(null);
  const navigate = useNavigate();
  const remove = useDeleteItem(item.id);

  const close = (): void => {
    setOpen(null);
  };

  return (
    <>
      <Button
        onClick={() => {
          setOpen("edit");
        }}
      >
        Edit
      </Button>
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

      {open === "edit" ? <EditItemDialog item={item} onClose={close} /> : null}

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
