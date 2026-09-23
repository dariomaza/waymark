import { type ItemView, type StorageUnitView } from "@waymark/api-client";
import { describeFailure } from "@waymark/i18n";
import { useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { EditItemDialog } from "./edit-item-dialog.js";
import { useDeleteItem } from "./item-mutations.js";
import { MoveItemsDialog } from "./move-items-dialog.js";
import { ROUTES, unitPath } from "../app/routes.js";
import { useTranslate } from "../app/language-context.js";

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
  const t = useTranslate();

  const [open, setOpen] = useState<"edit" | "move" | "delete" | null>(null);
  const navigate = useNavigate();
  const remove = useDeleteItem(item.id);

  const close = (): void => {
    setOpen(null);
  };

  return (
    <>
      <Button
        icon="pencil"
        onClick={() => {
          setOpen("edit");
        }}
      >
        {t("action.edit")}
      </Button>
      <Button
        icon="move"
        onClick={() => {
          setOpen("move");
        }}
      >
        {t("action.move")}
      </Button>
      {/*
        The bin is IN FRONT OF the word and never instead of it. Deleting is
        the one act nobody should perform from a picture they half recognised.
      */}
      <Button
        tone="danger"
        icon="trash"
        onClick={() => {
          setOpen("delete");
        }}
      >
        {t("action.delete")}
      </Button>

      {open === "edit" ? <EditItemDialog item={item} onClose={close} /> : null}

      {open === "move" ? (
        <MoveItemsDialog
          itemIds={[item.id]}
          title={t("sheet.move", { name: item.name })}
          targetLabel={t("items.moveInto")}
          confirmLabel={t("items.moveIt")}
          onClose={close}
        />
      ) : null}

      {open === "delete" ? (
        <Sheet title={t("sheet.delete", { name: item.name })} onClose={close}>
          <p>{t("items.deleteUndone", { name: item.name })}</p>
          {remove.isError ? (
            <Callout tone="wrong">{t(describeFailure(remove.error))}</Callout>
          ) : null}
          <div className="sheet__buttons">
            <Button onClick={close}>{t("action.cancel")}</Button>
            <Button
              tone="danger"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(undefined, {
                  onSuccess: () => {
                    close();
                    navigate(holder === null ? ROUTES.inventory : unitPath(holder.id), {
                      replace: true,
                    });
                  },
                });
              }}
            >
              {t("items.delete")}
            </Button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
};
