import { type ItemView } from "@waymark/api-client";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { EditItemDialog } from "./edit-item-dialog.js";
import { MoveItemsDialog } from "./move-items-dialog.js";
import { useTranslate } from "../app/language-context.js";

export interface ItemActionsProps {
  readonly item: ItemView;
}

/**
 * What an item's screen is FOR: correcting what it says, and saying where it
 * has gone.
 *
 * "Edit" changes what the item says about itself — its name, its quantity, its
 * tags. "Move" changes which box holds it. They are two controls because they
 * are two different acts, and only one of them can make the inventory lie
 * about where something is (ADR 14).
 *
 * Editing is the primary, because it is the superset: every field an item has
 * is behind it. Moving is the secondary rather than a third peer, and stays
 * visible rather than joining the menu, because a thing that has moved and has
 * not been recorded as moved is the one failure this whole product exists to
 * prevent — it should cost one tap.
 *
 * Deleting is not here. It is behind the menu beside the item's name, where a
 * thumb aiming at Edit cannot land on it (ADR 21).
 */
export const ItemActions = ({ item }: ItemActionsProps): JSX.Element => {
  const t = useTranslate();

  const [open, setOpen] = useState<"edit" | "move" | null>(null);

  const close = (): void => {
    setOpen(null);
  };

  return (
    <>
      <Button
        tone="primary"
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
    </>
  );
};
