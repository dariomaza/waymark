import type { ItemView } from "@waymark/api-client";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { DeleteItemSheet } from "./delete-item-sheet.js";
import { EditItemSheet } from "./edit-item-sheet.js";
import { MoveItemSheet } from "./move-item-sheet.js";
import { useTranslate } from "../app/language-context.js";

type OpenSheet = "edit" | "move" | "delete" | null;

/**
 * Edit and Move are separate buttons, because they are separate acts and only
 * one of them can make the inventory lie about where something is (ADR 14).
 */
export const ItemActions = ({
  item,
  onDeleted,
}: {
  readonly item: ItemView;
  readonly onDeleted: () => void;
}): JSX.Element => {
  const t = useTranslate();

  const [open, setOpen] = useState<OpenSheet>(null);
  const close = (): void => {
    setOpen(null);
  };

  return (
    <>
      <Button
        onPress={() => {
          setOpen("edit");
        }}
      >
        {t("action.edit")}
      </Button>
      <Button
        onPress={() => {
          setOpen("move");
        }}
      >
        {t("action.move")}
      </Button>
      <Button
        tone="danger"
        onPress={() => {
          setOpen("delete");
        }}
      >
        {t("action.delete")}
      </Button>

      {open === "edit" ? <EditItemSheet item={item} onClose={close} /> : null}
      {open === "move" ? <MoveItemSheet item={item} onClose={close} /> : null}
      {open === "delete" ? (
        <DeleteItemSheet
          item={item}
          onClose={close}
          onDeleted={() => {
            close();
            onDeleted();
          }}
        />
      ) : null}
    </>
  );
};
