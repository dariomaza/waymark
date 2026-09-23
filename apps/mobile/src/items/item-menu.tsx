import type { ItemView } from "@waymark/api-client";
import { useState, type JSX } from "react";

import { OverflowMenu, type OverflowAction } from "../ui/molecules/overflow-menu.js";
import { DeleteItemSheet } from "./delete-item-sheet.js";
import { useTranslate } from "../app/language-context.js";

export interface ItemMenuProps {
  readonly item: ItemView;
  readonly onDeleted: () => void;
}

/**
 * # Everything that can be done to an item that is not what the screen is for
 *
 * Today that is one line, and the line is Delete.
 *
 * A menu with one thing in it looks like ceremony, and it is worth saying why
 * it is not. The rule (ADR 21) is not "hide the rarely used"; it is that
 * nothing which destroys something may sit where a thumb reaching for the
 * primary action can land on it. On this screen the primary is Edit, and
 * before this change Delete was one 48pt target below it, in the same column,
 * in the same shape. Distance is the only guard a touch screen has.
 *
 * It is also where the second and third lines will go. The alternative — a bin
 * back in the column until there is enough to justify a menu — is how the
 * column got to six on the unit screen.
 */
export const ItemMenu = ({ item, onDeleted }: ItemMenuProps): JSX.Element => {
  const t = useTranslate();

  const [open, setOpen] = useState(false);
  const close = (): void => {
    setOpen(false);
  };

  const actions: readonly OverflowAction[] = [
    {
      label: t("action.delete"),
      icon: "trash",
      tone: "danger",
      destructive: true,
      onSelect: () => {
        setOpen(true);
      },
    },
  ];

  return (
    <>
      <OverflowMenu label={t("action.more", { name: item.name })} actions={actions} />

      {open ? (
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
