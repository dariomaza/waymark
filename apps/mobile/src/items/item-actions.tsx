import type { ItemView } from "@waymark/api-client";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { EditItemSheet } from "./edit-item-sheet.js";
import { MoveItemSheet } from "./move-item-sheet.js";
import { useTranslate } from "../app/language-context.js";

/**
 * What an item's screen is FOR: correcting what it says, and saying where it
 * has gone.
 *
 * Edit and Move are separate controls because they are separate acts, and only
 * one of them can make the inventory lie about where something is (ADR 14).
 *
 * Editing is the primary, because it is the superset: every field an item has
 * is behind it. Moving is the secondary rather than a third peer, and stays
 * visible rather than joining the menu, because a thing that has moved and has
 * not been recorded as moved is the one failure this product exists to prevent
 * — it should cost one tap.
 *
 * Deleting is not here. It is behind the menu beside the item's name, where a
 * thumb aiming at Edit cannot land on it (ADR 21).
 */
export const ItemActions = ({ item }: { readonly item: ItemView }): JSX.Element => {
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
        onPress={() => {
          setOpen("edit");
        }}
      >
        {t("action.edit")}
      </Button>
      <Button
        icon="move"
        onPress={() => {
          setOpen("move");
        }}
      >
        {t("action.move")}
      </Button>

      {open === "edit" ? <EditItemSheet item={item} onClose={close} /> : null}
      {open === "move" ? <MoveItemSheet item={item} onClose={close} /> : null}
    </>
  );
};
