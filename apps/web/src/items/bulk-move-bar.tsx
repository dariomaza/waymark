import type { ItemId } from "@ariadna/domain";
import { useState, type JSX } from "react";

import { Button } from "../ui/atoms/button.js";
import { MoveItemsDialog } from "./move-items-dialog.js";
import "./bulk-move-bar.css";
import { useTranslate } from "../app/language-context.js";

export interface BulkMoveBarProps {
  readonly itemIds: readonly ItemId[];
  readonly onDone: () => void;
}

/**
 * Emptying a box one item at a time is the chore ADR 3 set out to avoid, so
 * the selection lives on the unit screen and the move is one request.
 */
export const BulkMoveBar = ({ itemIds, onDone }: BulkMoveBarProps): JSX.Element => {
  const t = useTranslate();

  const [open, setOpen] = useState(false);
  const count = itemIds.length;

  return (
    <div className="bulk-bar">
      <Button
        tone="primary"
        onClick={() => {
          setOpen(true);
        }}
      >
        Move {count} {count === 1 ? "item" : "items"}
      </Button>
      <Button onClick={onDone}>{t("action.clearSelection")}</Button>

      {open ? (
        <MoveItemsDialog
          itemIds={itemIds}
          title={t("items.moveCount", { count })}
          targetLabel={t("items.moveThemInto")}
          confirmLabel={t("items.moveThem")}
          onMoved={onDone}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
};
