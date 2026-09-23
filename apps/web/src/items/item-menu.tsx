import { type ItemView, type StorageUnitView } from "@waymark/api-client";
import { describeFailure } from "@waymark/i18n";
import { useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { OverflowMenu, type OverflowAction } from "../ui/molecules/overflow-menu.js";
import { Sheet } from "../ui/organisms/sheet.js";
import { useDeleteItem } from "./item-mutations.js";
import { ROUTES, unitPath } from "../app/routes.js";
import { useTranslate } from "../app/language-context.js";

export interface ItemMenuProps {
  readonly item: ItemView;
  /** Where it currently is, so a delete can go back there. */
  readonly holder: StorageUnitView | null;
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
 * before this change Delete was one 48px target away from it, in the same row,
 * in the same shape. Distance is the only guard a touch screen has.
 *
 * It is also where the second and third lines will go. The alternative — a bin
 * back in the row until there is enough to justify a menu — is how the row got
 * to nine on the unit screen.
 */
export const ItemMenu = ({ item, holder }: ItemMenuProps): JSX.Element => {
  const t = useTranslate();

  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const remove = useDeleteItem(item.id);

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
